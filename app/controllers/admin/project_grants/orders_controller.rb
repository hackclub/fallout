class Admin::ProjectGrants::OrdersController < Admin::ApplicationController
  # No "Order" model exists; pin the wrap key so params.expect(:project_grant_order) matches.
  wrap_parameters :project_grant_order

  before_action :require_admin! # Approves grant money movements — admins only
  before_action :set_order, only: %i[ show update reconcile_pending_topup ]

  def index
    scope = policy_scope(ProjectGrantOrder).kept.includes(:user)
    scope = scope.where(state: params[:state]) if params[:state].present? && ProjectGrantOrder.states.key?(params[:state])

    @pagy, @orders = pagy(scope.order(created_at: :desc))
    user_ids = @orders.map(&:user_id).uniq
    active_card_user_ids = HcbGrantCard.active.where(user_id: user_ids).pluck(:user_id).to_set
    # Per-user "Total so far" — NET sum of completed topups (in minus out, so refunds
    # drop the total). Single grouped query.
    transferred_by_user = ProjectFundingTopup.kept.where(status: "completed", user_id: user_ids)
      .group(:user_id)
      .sum(Arel.sql("CASE direction WHEN 'out' THEN -amount_cents ELSE amount_cents END"))

    # For fulfilled orders, action_type should reflect history rather than current card
    # state — otherwise every fulfilled order reads as "Top-up" once any card exists.
    # The issuing topup for a card is its earliest completed topup (that's the one that
    # caused card.issue!); the order attached to that topup is the "New grant" order.
    # Handles card cancel → reissue: each card has its own issuing order.
    first_topup_per_card = ProjectFundingTopup.kept
      .where(status: "completed", user_id: user_ids)
      .group(:hcb_grant_card_id)
      .minimum(:id)
    new_grant_order_ids = ProjectFundingTopup.where(id: first_topup_per_card.values)
      .pluck(:project_grant_order_id).compact.to_set

    # Topup ledger lives on the same page as orders (no separate topups tab) — it's a
    # secondary read-only table below the orders. Uses a distinct page param (`tp`) so
    # its pagination doesn't collide with orders' `page`.
    topups_scope = policy_scope(ProjectFundingTopup).kept.includes(:user, :hcb_grant_card)
    topups_scope = topups_scope.where(status: params[:topup_status]) if params[:topup_status].present? && ProjectFundingTopup.statuses.key?(params[:topup_status])
    topups_pagy, topups = pagy(topups_scope.order(created_at: :desc), limit: 25, page: params[:tp], page_param: :tp)

    # Warnings: third section on the page. Unresolved only by default; admin can
    # include resolved via ?include_resolved=1 to review history.
    # Eager-load only the belongs_to we actually dereference in serialize_warning.
    # project_grant_order and project_funding_topup are exposed as bare FK ids in the
    # serialized output, so loading them is wasteful (bullet flagged it).
    warnings_scope = policy_scope(ProjectGrantWarning).includes(:user, :hcb_grant_card, :resolved_by)
    warnings_scope = warnings_scope.unresolved unless params[:include_resolved] == "1"
    @warnings = warnings_scope.order(resolved_at: :asc, last_detected_at: :desc).limit(100)

    # Status pills in the header. last_scan_at is a proxy: HcbGrantCardSyncJob runs
    # ProjectGrantWarning.scan_all! right after each card sync, so the newest card
    # last_synced_at ≈ the last scan cycle.
    conn = HcbConnection.current
    hcb_auth_status = if !HcbService.configured? then "not_configured"
    elsif conn.nil? || conn.access_token.blank? then "disconnected"
    elsif conn.token_expired? then "expired"
    else "connected"
    end

    # Header stats — cheap aggregate queries; cents summed so we can format client-side.
    # Transactions stat counts only `purchase` rows — org↔card transfers (topups,
    # withdrawals, initial grants) aren't user-visible activity and shouldn't inflate
    # the number.
    # `actual` vs `expected`:
    #   actual   = HCB's authoritative amount_cents across all grant cards (reality)
    #   expected = Fallout's ledger net — what we think we've sent (our record)
    # A drift means either external HCB activity (actual > expected) or a missing sync
    # on our side (expected > actual). Same framing is used per-card on
    # admin/users/show.
    stats = {
      issued_actual_cents: HcbGrantCard.sum(:amount_cents),
      issued_expected_cents: ProjectFundingTopup.kept.where(status: "completed").sum(
        Arel.sql("CASE direction WHEN 'out' THEN -amount_cents ELSE amount_cents END")
      ),
      active_cards: HcbGrantCard.where(status: "active").count,
      transactions: HcbTransaction.purchases.count
    }

    render inertia: "admin/project_grants/orders/index", props: {
      orders: @orders.map { |o| serialize_row(o, active_card_user_ids, transferred_by_user, new_grant_order_ids) },
      pagy: pagy_props(@pagy),
      state_filter: params[:state].to_s,
      topups: topups.map { |t| serialize_topup(t) },
      topups_pagy: pagy_props(topups_pagy),
      topup_status_filter: params[:topup_status].to_s,
      warnings: @warnings.map { |w| serialize_warning(w) },
      warnings_include_resolved: params[:include_resolved] == "1",
      warning_kind_descriptions: ProjectGrantWarning::KIND_DESCRIPTIONS,
      last_scan_at: HcbGrantCard.maximum(:last_synced_at)&.iso8601,
      hcb_auth_status: hcb_auth_status,
      stats: stats,
      rates: rate_props,
      hours_configured: HcbGrantSetting.current.hours_rate_configured?,
      is_hcb: current_user.hcb? # Gates the Batch fulfill button — money movement requires the hcb role
    }
  end

  def show
    authorize @order

    render inertia: "admin/project_grants/orders/show", props: {
      order: serialize_detail(@order),
      ledger: serialize_ledger(@order.user),
      rates: rate_props,
      hours_configured: HcbGrantSetting.current.hours_rate_configured?,
      is_hcb: current_user.hcb? # Gates the "fulfilled" state option and "Mark as completed" reconciliation
    }
  end

  def update
    authorize @order

    # Money guard: transitioning to `fulfilled` triggers an HCB topup. Only the `hcb`
    # role may push that button — regular admins can edit the note or move the order
    # to pending/on_hold/rejected, but cannot fulfill it.
    if update_params[:state] == "fulfilled" && !@order.fulfilled?
      authorize @order, :fulfill?
    end

    was_fulfilled = @order.fulfilled?
    if @order.update(update_params)
      enqueue_topup_if_newly_fulfilled(@order, was_fulfilled)
      redirect_to admin_project_grants_order_path(@order), notice: "Order updated."
    else
      redirect_back fallback_location: admin_project_grants_order_path(@order),
        inertia: { errors: @order.errors.messages }
    end
  end

  # POST /admin/project_grants/orders/batch_fulfill
  # Transitions each selected pending/on_hold order to fulfilled and enqueues one
  # topup job per distinct user (jobs are idempotent and dedupe via advisory lock).
  def batch_fulfill
    # Collection action — `authorize` on the class drives the policy check by itself;
    # no record to skip_authorize on, and the class-level authorize satisfies Pundit's
    # verify_authorized callback.
    authorize ProjectGrantOrder, :batch_fulfill?

    ids = Array(params[:order_ids]).map(&:to_i).reject(&:zero?)
    if ids.empty?
      redirect_to admin_project_grants_orders_path(state: "pending"), alert: "No orders selected."
      return
    end

    # Scope through Pundit so this still does the right thing if ProjectGrantOrderPolicy::Scope
    # is ever tightened beyond the current admin-sees-all behavior.
    orders = policy_scope(ProjectGrantOrder).kept.where(id: ids)
    transitioned_user_ids = []
    failed = []

    orders.each do |order|
      next if order.fulfilled?

      if order.update(state: "fulfilled")
        transitioned_user_ids << order.user_id
        ProjectFundingTopupJob.perform_later(order.user_id, triggering_order_id: order.id)
      else
        failed << [ order.id, order.errors.full_messages.join(", ") ]
      end
    end

    notice = "Fulfilled #{transitioned_user_ids.size} order(s) across #{transitioned_user_ids.uniq.size} user(s)."
    notice += " #{failed.size} failed: #{failed.map(&:first).join(', ')}." if failed.any?
    redirect_to admin_project_grants_orders_path(state: "pending"), notice: notice
  end

  # POST /admin/project_grants/orders/:id/reconcile_pending_topup
  # Admin manually resolves a pending topup row (outbox pattern) after verifying
  # against HCB whether the write actually landed.
  def reconcile_pending_topup
    authorize @order, :reconcile_pending_topup?

    pending = @order.user.project_funding_topups.kept.where(status: "pending").first
    unless pending
      redirect_to admin_project_grants_order_path(@order), alert: "No pending topup to reconcile."
      return
    end

    resolution = params[:resolution].to_s
    case resolution
    when "completed"
      # Saying "yes, the money landed" is a money-side decision — gate on the hcb role.
      authorize @order, :mark_topup_completed?
      pending.update!(status: "completed", completed_at: Time.current)
      redirect_to admin_project_grants_order_path(@order), notice: "Marked topup as completed."
    when "failed"
      pending.update!(status: "failed", failed_reason: params[:failed_reason].presence || "Manually reconciled")
      redirect_to admin_project_grants_order_path(@order), notice: "Marked topup as failed; service can retry."
    else
      redirect_to admin_project_grants_order_path(@order), alert: "Invalid resolution."
    end
  end

  private

  def set_order
    @order = ProjectGrantOrder.kept.find(params[:id])
  end

  def update_params
    params.expect(project_grant_order: [ :state, :admin_note ])
  end

  def enqueue_topup_if_newly_fulfilled(order, was_fulfilled_before)
    return if was_fulfilled_before
    return unless order.fulfilled?

    ProjectFundingTopupJob.perform_later(order.user_id, triggering_order_id: order.id)
  end

  def rate_props
    setting = HcbGrantSetting.current
    {
      koi_to_cents_numerator: setting.koi_to_cents_numerator,
      koi_to_cents_denominator: setting.koi_to_cents_denominator,
      koi_to_hours_numerator: setting.koi_to_hours_numerator,
      koi_to_hours_denominator: setting.koi_to_hours_denominator
    }
  end

  def serialize_warning(warning)
    {
      id: warning.id,
      kind: warning.kind,
      message: warning.message,
      details: warning.details,
      detection_count: warning.detection_count,
      last_detected_at: warning.last_detected_at.iso8601,
      resolved_at: warning.resolved_at&.iso8601,
      resolution_note: warning.resolution_note,
      resolved_by: warning.resolved_by ? { id: warning.resolved_by.id, display_name: warning.resolved_by.display_name } : nil,
      user: warning.user ? { id: warning.user.id, display_name: warning.user.display_name } : nil,
      hcb_grant_card: warning.hcb_grant_card ? { id: warning.hcb_grant_card.id, hcb_id: warning.hcb_grant_card.hcb_id } : nil,
      project_grant_order_id: warning.project_grant_order_id,
      project_funding_topup_id: warning.project_funding_topup_id
    }
  end

  def serialize_topup(topup)
    {
      id: topup.id,
      user: { id: topup.user.id, display_name: topup.user.display_name },
      hcb_grant_card_hcb_id: topup.hcb_grant_card&.hcb_id,
      project_grant_order_id: topup.project_grant_order_id,
      amount_cents: topup.amount_cents,
      direction: topup.direction,
      status: topup.status,
      counts_toward_funding: topup.counts_toward_funding,
      note: topup.note,
      completed_at: topup.completed_at&.strftime("%b %d, %Y %H:%M"),
      failed_reason: topup.failed_reason,
      created_at: topup.created_at.strftime("%b %d, %Y %H:%M")
    }
  end

  def serialize_row(order, active_card_user_ids, transferred_by_user, new_grant_order_ids)
    # For fulfilled orders, reflect what actually happened: orders whose topup was the
    # first completed topup on its card caused a new grant issue; everything else topped
    # up an existing card. For unfulfilled orders, predict from current card state.
    action_type = if order.fulfilled?
      new_grant_order_ids.include?(order.id) ? "new_grant" : "top_up"
    else
      active_card_user_ids.include?(order.user_id) ? "top_up" : "new_grant"
    end

    {
      id: order.id,
      user: { id: order.user.id, display_name: order.user.display_name, email: order.user.email, avatar: order.user.avatar },
      frozen_koi_amount: order.frozen_koi_amount,
      frozen_usd_cents: order.frozen_usd_cents,
      action_type: action_type,
      user_total_transferred_cents: transferred_by_user[order.user_id] || 0,
      state: order.state,
      created_at: order.created_at.strftime("%b %d, %Y %H:%M")
    }
  end

  def serialize_detail(order)
    user = order.user
    has_active_card = user.hcb_grant_cards.active.exists?
    pending_topup = user.project_funding_topups.kept.where(status: "pending").first

    # For fulfilled orders, check whether this order's topup was the first completed
    # topup on its card (meaning it caused card.issue!). Handles cancel-and-reissue:
    # each card has its own "issuing" order. For unfulfilled, predict from card state.
    action_type = if order.fulfilled?
      card_ids = user.project_funding_topups.kept
        .where(status: "completed", project_grant_order_id: order.id)
        .pluck(:hcb_grant_card_id).uniq
      issuing_topup_ids = ProjectFundingTopup.kept
        .where(status: "completed", hcb_grant_card_id: card_ids)
        .group(:hcb_grant_card_id).minimum(:id).values
      order_issued_a_card = ProjectFundingTopup.where(id: issuing_topup_ids, project_grant_order_id: order.id).exists?
      order_issued_a_card ? "new_grant" : "top_up"
    else
      has_active_card ? "top_up" : "new_grant"
    end

    {
      id: order.id,
      user: { id: user.id, display_name: user.display_name, email: user.email, avatar: user.avatar },
      frozen_koi_amount: order.frozen_koi_amount,
      frozen_usd_cents: order.frozen_usd_cents,
      state: order.state,
      admin_note: order.admin_note,
      created_at: order.created_at.strftime("%b %d, %Y %H:%M"),
      action_type: action_type,
      pending_topup: pending_topup && {
        id: pending_topup.id,
        amount_cents: pending_topup.amount_cents,
        created_at: pending_topup.created_at.strftime("%b %d, %Y %H:%M")
      }
    }
  end

  def serialize_ledger(user)
    expected = ProjectFundingTopupService.expected_usd_cents(user)
    transferred = ProjectFundingTopupService.transferred_usd_cents(user)
    {
      expected_cents: expected,
      transferred_cents: transferred,
      delta_cents: expected - transferred,
      recent_topups: user.project_funding_topups.kept.order(created_at: :desc).limit(10).map do |t|
        {
          id: t.id,
          amount_cents: t.amount_cents,
          status: t.status,
          completed_at: t.completed_at&.strftime("%b %d, %Y %H:%M"),
          failed_reason: t.failed_reason,
          created_at: t.created_at.strftime("%b %d, %Y %H:%M")
        }
      end
    }
  end
end
