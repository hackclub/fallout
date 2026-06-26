class Admin::ShopOrdersController < Admin::ApplicationController
  before_action :require_admin! # Only admins manage orders, not reviewers

  def index
    # policy_scope runs on the critical path so verify_policy_scoped passes on the initial
    # (deferred) render; it's lazy, so no query fires until the deferred loader enumerates it.
    scope = policy_scope(ShopOrder)
    render inertia: "admin/shop_orders/index", props: {
      state_filter: params[:state].to_s,
      item_filter: params[:shop_item_id].to_s,
      currency_filter: params[:currency].to_s,
      user_id_filter: params[:user_id].to_s,
      user_filter: prefill_user_payload,
      search: params[:search].to_s,
      items: ShopItem.order(:name).pluck(:id, :name, :currency, :image_url, :price)
        .map { |id, name, currency, image_url, price| { id: id, name: name, currency: currency, image_url: image_url.to_s, price: price } },
      counts: state_counts(scope),
      **deferred_index_props(scope)
    }
  end

  def show
    @order = ShopOrder.find(params[:id])
    authorize @order

    render inertia: "admin/shop_orders/show", props: {
      order: serialize_order_detail(@order)
    }
  end

  def update
    @order = ShopOrder.find(params[:id])
    authorize @order

    was_rejected = @order.rejected?
    if @order.update(order_params)
      revoke_streak_freeze(@order, was_rejected)
      # redirect_back so the same call serves both the detail page and inline edits from the list.
      redirect_back fallback_location: admin_shop_order_path(@order), notice: "Order updated."
    else
      redirect_back fallback_location: admin_shop_order_path(@order),
        inertia: { errors: @order.errors.messages }
    end
  end

  # Apply one state to many orders at once (the list's bulk action bar and per-row quick actions).
  def bulk_update
    authorize ShopOrder, :update? # class-level check; ShopOrderPolicy#update? only reads admin?

    new_state = params[:state].to_s
    unless ShopOrder.states.key?(new_state)
      return redirect_back fallback_location: admin_shop_orders_path, alert: "Invalid order state."
    end

    ids = Array(params[:ids]).map(&:to_i).reject(&:zero?)
    orders = policy_scope(ShopOrder).where(id: ids).includes(:shop_item)

    updated = 0
    orders.each do |order|
      was_rejected = order.rejected?
      if order.update(state: new_state)
        revoke_streak_freeze(order, was_rejected)
        updated += 1
      end
    end

    redirect_back fallback_location: admin_shop_orders_path,
      notice: "#{updated} #{'order'.pluralize(updated)} updated."
  end

  private

  # Memoized loader shared by the deferred index props so the heavy query runs once per
  # deferred request even though orders/pagy/stats are separate Inertia props.
  def deferred_index_props(scope)
    memo = nil
    load = lambda do
      memo ||= begin
        filtered = apply_filters(scope)
        @pagy, orders = pagy(filtered.includes(:user, :shop_item).order(created_at: :desc))
        # Money figures exclude rejected orders (those are refunded — see ShopOrder balance calc),
        # so they reflect what the matching set actually pulled in.
        count, koi_sum, gold_sum = filtered.reorder(nil).pick(Arel.sql(
          "COUNT(*), " \
          "COALESCE(SUM(frozen_koi_amount) FILTER (WHERE state <> 'rejected'), 0), " \
          "COALESCE(SUM(frozen_gold_amount) FILTER (WHERE state <> 'rejected'), 0)"
        ))
        {
          orders: orders.map { |o| serialize_order_row(o) },
          pagy: pagy_props(@pagy),
          stats: { orders: count, koi: koi_sum, gold: gold_sum }
        }
      end
    end
    {
      orders: InertiaRails.defer(group: "index") { load.call[:orders] },
      pagy: InertiaRails.defer(group: "index") { load.call[:pagy] },
      stats: InertiaRails.defer(group: "index") { load.call[:stats] }
    }
  end

  def apply_filters(scope, include_state: true)
    scope = scope.where(state: params[:state]) if include_state && ShopOrder.states.key?(params[:state])
    scope = scope.where(shop_item_id: params[:shop_item_id]) if params[:shop_item_id].present?
    scope = scope.where(user_id: params[:user_id]) if params[:user_id].present?

    if ShopItem::CURRENCIES.include?(params[:currency])
      scope = scope.joins(:shop_item).where(shop_items: { currency: params[:currency] })
    end

    if params[:search].present?
      raw = params[:search].to_s.strip
      term = "%#{ActiveRecord::Base.sanitize_sql_like(raw)}%"
      scope = scope.joins(:user, :shop_item)
      if raw.match?(/\A\d+\z/)
        scope = scope.where(
          "users.display_name ILIKE :q OR users.email ILIKE :q OR shop_items.name ILIKE :q OR shop_orders.id = :id",
          q: term, id: raw.to_i
        )
      else
        scope = scope.where("users.display_name ILIKE :q OR users.email ILIKE :q OR shop_items.name ILIKE :q", q: term)
      end
    end

    scope
  end

  # Per-state counts for the list tabs. Respects every filter EXCEPT state, so each tab shows how
  # many orders in that state match the current item/user/currency/search.
  def state_counts(scope)
    by_state = apply_filters(scope, include_state: false).reorder(nil).group(:state).count
    {
      all: by_state.values.sum,
      pending: by_state["pending"].to_i,
      on_hold: by_state["on_hold"].to_i,
      fulfilled: by_state["fulfilled"].to_i,
      rejected: by_state["rejected"].to_i
    }
  end

  def revoke_streak_freeze(order, was_rejected_before)
    # If a streak freeze order is newly rejected, decrement the user's streak freezes to match the refund
    return if was_rejected_before
    return unless order.rejected? && order.shop_item.grants_streak_freeze?

    User.where(id: order.user_id).where("streak_freezes >= ?", order.quantity)
        .update_all([ "streak_freezes = streak_freezes - ?", order.quantity ])
  end

  def order_params
    params.expect(shop_order: [ :state, :admin_note ])
  end

  def serialize_order_row(order)
    item = order.shop_item
    {
      id: order.id,
      user: { id: order.user.id, display_name: order.user.display_name, email: order.user.email, avatar: order.user.avatar },
      shop_item: { id: item.id, name: item.name, currency: item.currency },
      quantity: order.quantity,
      frozen_price: order.frozen_price,
      total_cost: order.frozen_price * order.quantity,
      frozen_koi_amount: order.frozen_koi_amount,
      frozen_gold_amount: order.frozen_gold_amount,
      requires_shipping: item.requires_shipping,
      state: order.state,
      created_at: order.created_at.strftime("%b %-d, %Y · %H:%M")
    }
  end

  def serialize_order_detail(order)
    item = order.shop_item
    serialize_order_row(order).merge(
      image_url: item.image_url.to_s,
      description: item.description.to_s,
      requires_date_selection: item.requires_date_selection,
      selected_dates: Array(order.selected_dates),
      address: order.address,
      phone: order.phone,
      admin_note: order.admin_note,
      user_koi_balance: order.user.koi,
      user_gold_balance: order.user.gold,
      updated_at: order.updated_at.strftime("%b %-d, %Y · %H:%M")
    )
  end

  # email/koi/gold are admin-only (require_admin! on the whole controller), so PII here is permitted.
  def prefill_user_payload
    return nil if params[:user_id].blank?

    user = User.find_by(id: params[:user_id])
    return nil unless user

    { id: user.id, display_name: user.display_name, avatar: user.avatar, email: user.email, koi: user.koi, gold: user.gold }
  end
end
