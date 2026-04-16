class ShopItemsController < ApplicationController
  allow_trial_access only: %i[index show] # Shop is viewable by trial users

  def index
    authorize ShopItem # Enforces Flipper :shop flag via index? policy
    @shop_items = policy_scope(ShopItem).order(price: :asc)

    render inertia: "shop/index", props: {
      shop_items: @shop_items.map { |item| serialize_shop_item(item) },
      koi_balance: current_user.koi,
      gold_balance: current_user.gold,
      user_hours: (current_user.total_time_logged_seconds / 3600.0).floor,
      is_modal: request.headers["X-InertiaUI-Modal"].present?,
      user_id: current_user.id,
      pending_dialog: shop_pending_dialog
    }
  end

  def show
    @shop_item = ShopItem.find(params[:id])
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

  private

  def shop_pending_dialog
    return nil if current_user.trial?

    campaign = current_user.dialog_campaigns.find_or_create_by(key: "shop_intro")
    campaign.seen? ? nil : "shop_intro"
  rescue ActiveRecord::RecordNotUnique
    current_user.dialog_campaigns.find_by!(key: "shop_intro").seen? ? nil : "shop_intro"
  end

  def serialize_shop_item(item)
    { id: item.id, name: item.name, description: item.description, price: item.price, image_url: item.image_url, status: item.status, featured: item.featured, currency: item.currency }
  end
end
