class Admin::ShopItemsController < Admin::ApplicationController
  before_action :require_admin! # Shop item management is admin-only
  before_action :set_shop_item, only: [ :edit, :update, :destroy ]

  def index
    items = policy_scope(ShopItem)

    if params[:q].present?
      term = "%#{ActiveRecord::Base.sanitize_sql_like(params[:q])}%"
      items = items.where("name ILIKE :t OR description ILIKE :t", t: term)
    end
    items = items.where(status: params[:status]) if ShopItem::STATUSES.include?(params[:status])
    items = items.where(currency: params[:currency]) if ShopItem::CURRENCIES.include?(params[:currency])
    items = items.where(featured: params[:featured] == "true") if params[:featured].in?(%w[true false])

    items = items.left_joins(:shop_orders)
      .select("shop_items.*, COUNT(shop_orders.id) AS shop_orders_count")
      .group("shop_items.id")
      .order(featured: :desc, price: :asc)

    render inertia: "admin/shop_items/index", props: {
      shop_items: items.map { |item| serialize(item, orders_count: item.shop_orders_count) },
      stats: stats,
      filters: params.permit(:q, :status, :currency, :featured).to_h
    }
  end

  def new
    authorize ShopItem
    render inertia: "admin/shop_items/new"
  end

  def create
    @shop_item = ShopItem.new(shop_item_params)
    authorize @shop_item

    if @shop_item.save
      redirect_to admin_shop_items_path, notice: "#{@shop_item.name} created."
    else
      redirect_back fallback_location: new_admin_shop_item_path,
        inertia: { errors: @shop_item.errors.messages }
    end
  end

  def edit
    authorize @shop_item
    render inertia: "admin/shop_items/edit", props: {
      shop_item: serialize(@shop_item, orders_count: @shop_item.shop_orders.count)
    }
  end

  def update
    authorize @shop_item

    if @shop_item.update(shop_item_params)
      redirect_to admin_shop_items_path, notice: "#{@shop_item.name} saved."
    else
      redirect_back fallback_location: edit_admin_shop_item_path(@shop_item),
        inertia: { errors: @shop_item.errors.messages }
    end
  end

  def destroy
    authorize @shop_item

    if @shop_item.destroy
      redirect_to admin_shop_items_path, notice: "#{@shop_item.name} deleted."
    else
      redirect_to admin_shop_items_path, alert: @shop_item.errors.full_messages.to_sentence
    end
  end

  private

  def set_shop_item
    @shop_item = ShopItem.find(params[:id])
  end

  def stats
    scope = policy_scope(ShopItem)
    {
      total: scope.count,
      available: scope.where(status: "available").count,
      unavailable: scope.where(status: "unavailable").count,
      featured: scope.where(featured: true).count
    }
  end

  def shop_item_params
    params.expect(shop_item: [ :name, :description, :price, :image_url, :status, :featured, :currency, :grants_streak_freeze, :requires_shipping, :requires_date_selection ])
  end

  def serialize(item, orders_count: nil)
    { id: item.id, name: item.name, description: item.description.to_s, price: item.price,
      image_url: item.image_url.to_s, status: item.status, featured: item.featured, currency: item.currency,
      grants_streak_freeze: item.grants_streak_freeze, requires_shipping: item.requires_shipping,
      requires_date_selection: item.requires_date_selection, orders_count: orders_count,
      created_at: item.created_at&.strftime("%b %-d, %Y") }
  end
end
