class Admin::ProjectGrants::AdjustmentsController < Admin::ApplicationController
  # No `index` action — ApplicationController registers `verify_authorized, except: :index`
  # and `verify_policy_scoped, only: :index`, both of which Rails 8.1 raises on when the
  # named action is absent. Blanket-skip both; each action still calls `authorize`
  # explicitly so Pundit enforcement is preserved.
  skip_after_action :verify_authorized
  skip_after_action :verify_policy_scoped

  # Money movement surface — only admins with hcb role may book manual ledger entries.
  # Pinned wrap key so params.expect(:project_grant_adjustment) matches (no model class by that name).
  wrap_parameters :project_grant_adjustment

  def new
    authorize ProjectFundingTopup, :new?

    # One-shot token to guard against duplicate submissions (browser back, double-click,
    # network retry). Server keeps the last N issued tokens in session; create consumes
    # the token so replays fail closed.
    key = SecureRandom.uuid
    session[:valid_adjustment_keys] = ((session[:valid_adjustment_keys] || []) + [ key ]).last(20)

    render inertia: "admin/project_grants/adjustments/new", props: {
      prefill_user_id: params[:user_id].to_s,
      idempotency_key: key
    }
  end

  # JSON sidecar for the new-adjustment form. Called from React as the admin types a
  # user ID so the form can render a live "current → projected" ledger preview. Returns
  # a stable shape whether the user exists or not — the UI decides what to show.
  def ledger
    authorize ProjectFundingTopup, :new?

    user = User.find_by(id: params[:user_id])
    unless user
      render json: { found: false }
      return
    end

    # `actual` and `expected` use the same framing as the stats tile and the per-card
    # view on admin/users/show: actual is what HCB actually holds (reality), expected
    # is what Fallout's ledger says should be there. The adjustment being previewed
    # shifts expected (since it writes a ledger row) and leaves actual unchanged.
    render json: {
      found: true,
      user: { id: user.id, display_name: user.display_name, email: user.email },
      has_card: user.hcb_grant_cards.exists?,
      actual_cents: user.hcb_grant_cards.sum(:amount_cents),
      expected_cents: ProjectFundingTopupService.transferred_usd_cents(user)
    }
  end

  def create
    authorize ProjectFundingTopup, :create?

    # Consume the one-shot idempotency token before doing any work. A replay (browser
    # back + submit, network retry) will miss — the session list no longer has the key.
    key = adjustment_params[:idempotency_key].to_s
    valid_keys = session[:valid_adjustment_keys] || []
    unless valid_keys.include?(key)
      redirect_to new_admin_project_grants_adjustment_path,
        alert: "This form was already submitted or has expired. Please start a new adjustment."
      return
    end
    session[:valid_adjustment_keys] = valid_keys - [ key ]

    user = User.find_by(id: adjustment_params[:user_id])
    unless user
      redirect_to new_admin_project_grants_adjustment_path, alert: "User not found."
      return
    end

    card = user.hcb_grant_cards.active.first || user.hcb_grant_cards.order(created_at: :desc).first
    unless card
      redirect_to new_admin_project_grants_adjustment_path(user_id: user.id),
        alert: "User has no HCB grant card on record — issue a grant through the normal order flow first."
      return
    end

    direction = adjustment_params[:direction].to_s
    unless ProjectFundingTopup::DIRECTIONS.include?(direction)
      redirect_to new_admin_project_grants_adjustment_path(user_id: user.id), alert: "Invalid direction."
      return
    end

    amount_cents = (adjustment_params[:amount_dollars].to_f * 100).round
    note = adjustment_params[:note].to_s.strip
    if note.blank?
      redirect_to new_admin_project_grants_adjustment_path(user_id: user.id),
        alert: "A note is required so future admins understand why this adjustment exists."
      return
    end

    # ActiveRecord coerces "1"/"0"/"true"/"false" → boolean when assigning to a
    # boolean column, so we can take the raw param. Checkbox unchecked → not
    # present → defaults to false, which is the safer choice for adjustments
    # (admin must opt in to "this is issued funding").
    counts_toward_funding = ActiveModel::Type::Boolean.new.cast(adjustment_params[:counts_toward_funding])

    topup = ProjectFundingTopup.new(
      user: user,
      hcb_grant_card: card,
      direction: direction,
      amount_cents: amount_cents,
      # Manual adjustments skip the outbox — they reflect an already-reconciled real-world
      # action (admin topped up HCB by hand, or invoiced the user back). Terminal on create.
      status: "completed",
      completed_at: Time.current,
      counts_toward_funding: counts_toward_funding,
      note: "[Manual adjustment by #{current_user.display_name}] #{note}"
    )

    if topup.save
      redirect_to admin_project_grants_orders_path,
        notice: "Recorded #{direction} adjustment of $#{'%.2f' % (amount_cents / 100.0)} for #{user.display_name}."
    else
      redirect_to new_admin_project_grants_adjustment_path(user_id: user.id),
        inertia: { errors: topup.errors.messages }
    end
  end

  private

  def adjustment_params
    params.expect(project_grant_adjustment: [ :user_id, :direction, :amount_dollars, :note, :counts_toward_funding, :idempotency_key ])
  end
end
