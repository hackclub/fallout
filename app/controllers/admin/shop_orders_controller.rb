class Admin::ShopOrdersController < Admin::ApplicationController
  before_action :require_admin! # Only admins manage orders, not reviewers

  def index
    scope = policy_scope(ShopOrder).includes(:user, :shop_item)
    scope = scope.where(state: params[:state]) if params[:state].present?
    @pagy, @orders = pagy(scope.order(created_at: :desc))

    render inertia: "admin/shop_orders/index", props: {
      orders: @orders.map { |o| serialize_order_row(o) },
      pagy: pagy_props(@pagy),
      state_filter: params[:state].to_s
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

    if @order.update(order_params)
      redirect_to admin_shop_order_path(@order), notice: "Order updated."
    else
      redirect_back fallback_location: admin_shop_order_path(@order),
        inertia: { errors: @order.errors.messages }
    end
  end

  private

  def order_params
    params.expect(shop_order: [ :state, :admin_note ])
  end

  def serialize_order_row(order)
    {
      id: order.id,
      user: { id: order.user.id, display_name: order.user.display_name, email: order.user.email },
      shop_item: { id: order.shop_item.id, name: order.shop_item.name },
      frozen_price: order.frozen_price,
      quantity: order.quantity,
      total_cost: order.frozen_price * order.quantity,
      state: order.state,
      created_at: order.created_at.strftime("%b %d, %Y %H:%M")
    }
  end

  def serialize_order_detail(order)
    serialize_order_row(order).merge(
      address: order.address,
      phone: order.phone,
      admin_note: order.admin_note,
      user_koi_balance: order.user.koi
    )
  end
end
