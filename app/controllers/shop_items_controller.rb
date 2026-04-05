class ShopItemsController < ApplicationController
  allow_trial_access only: %i[index show] # Shop is viewable by trial users
  before_action :set_shop_item, only: %i[show edit update destroy]

  def index
    skip_policy_scope # No scope needed until shop items are listed
    authorize ShopItem # Verify user can view the shop

    render inertia: "shop/index", props: {
      shop_items: ShopItem.order(price: :asc).map { |item| serialize_shop_item(item) },
      koi_balance: current_user.koi,
      user_hours: (current_user.total_time_logged_seconds / 3600.0).floor,
      is_modal: request.headers["X-InertiaUI-Modal"].present?,
      user_id: current_user.id
    }
  end

  def show
    authorize @shop_item

    render inertia: "shop/show", props: {
      shop_item: serialize_shop_item(@shop_item),
      can: {
        update: policy(@shop_item).update?,
        destroy: policy(@shop_item).destroy?
      },
      is_modal: request.headers["X-InertiaUI-Modal"].present?
    }
  end

  def new
    @shop_item = ShopItem.new
    authorize @shop_item

    render inertia: "shop/form", props: {
      shop_item: { id: nil, name: "", description: "", price: "", image_url: "", status: "available" },
      title: "New Shop Item",
      submit_url: shop_items_path,
      method: "post",
      is_modal: request.headers["X-InertiaUI-Modal"].present?
    }
  end

  def create
    @shop_item = ShopItem.new(shop_item_params)
    authorize @shop_item

    if @shop_item.save
      redirect_to shop_item_path(@shop_item), notice: "Shop item created."
    else
      redirect_back fallback_location: new_shop_item_path, inertia: { errors: @shop_item.errors.messages }
    end
  end

  def edit
    authorize @shop_item

    render inertia: "shop/form", props: {
      shop_item: { id: @shop_item.id, name: @shop_item.name, description: @shop_item.description.to_s, price: @shop_item.price, image_url: @shop_item.image_url, status: @shop_item.status },
      title: "Edit Shop Item",
      submit_url: shop_item_path(@shop_item),
      method: "patch",
      is_modal: request.headers["X-InertiaUI-Modal"].present?
    }
  end

  def update
    authorize @shop_item

    if @shop_item.update(shop_item_params)
      redirect_to shop_item_path(@shop_item), notice: "Shop item updated."
    else
      redirect_back fallback_location: edit_shop_item_path(@shop_item), inertia: { errors: @shop_item.errors.messages }
    end
  end

  def destroy
    authorize @shop_item
    @shop_item.destroy
    redirect_to shop_items_path, notice: "Shop item deleted."
  end

  private

  def set_shop_item
    @shop_item = ShopItem.find(params[:id])
  end

  def shop_item_params
    params.expect(shop_item: [ :name, :description, :price, :image_url, :status, :featured, :ticket ])
  end

  def serialize_shop_item(item)
    { id: item.id, name: item.name, description: item.description, price: item.price, image_url: item.image_url, status: item.status, featured: item.featured, ticket: item.ticket }
  end
end
