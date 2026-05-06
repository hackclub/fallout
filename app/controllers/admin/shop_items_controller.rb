class Admin::ShopItemsController < Admin::ApplicationController
  before_action :require_admin! # Shop item management is admin-only

  def index
    @shop_items = policy_scope(ShopItem).order(price: :asc)

    render inertia: "admin/shop_items/index", props: {
      shop_items: @shop_items.map { |item| serialize(item) }
    }
  end

  def create
    @shop_item = ShopItem.new(shop_item_params)
    authorize @shop_item

    if @shop_item.save
      redirect_to admin_shop_items_path, notice: "Item created."
    else
      redirect_back fallback_location: admin_shop_items_path,
        inertia: { errors: @shop_item.errors.messages }
    end
  end

  def update
    @shop_item = ShopItem.find(params[:id])
    authorize @shop_item

    if @shop_item.update(shop_item_params)
      redirect_to admin_shop_items_path, notice: "Saved."
    else
      redirect_back fallback_location: admin_shop_items_path,
        inertia: { errors: @shop_item.errors.messages }
    end
  end

  def destroy
    @shop_item = ShopItem.find(params[:id])
    authorize @shop_item

    if @shop_item.destroy
      redirect_to admin_shop_items_path, notice: "Item deleted."
    else
      redirect_back fallback_location: admin_shop_items_path,
        inertia: { errors: { base: @shop_item.errors.full_messages } }
    end
  end

  private

  def shop_item_params
    params.expect(shop_item: [ :name, :description, :price, :image_url, :status, :featured, :currency, :grants_streak_freeze, :requires_shipping ])
  end

  def serialize(item)
    { id: item.id, name: item.name, description: item.description.to_s, price: item.price,
      image_url: item.image_url.to_s, status: item.status, featured: item.featured, currency: item.currency,
      grants_streak_freeze: item.grants_streak_freeze, requires_shipping: item.requires_shipping }
  end
end
