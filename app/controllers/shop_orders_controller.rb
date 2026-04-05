class ShopOrdersController < ApplicationController
  # No index action — blanket skip required to avoid AbstractController::ActionNotFound
  # from ApplicationController's `after_action :verify_authorized, except: :index`
  skip_after_action :verify_authorized
  skip_after_action :verify_policy_scoped

  before_action :set_shop_item
  before_action :require_enabled_item, only: %i[new create] # Only block orders on unavailable items, not viewing existing ones

  def show
    @shop_order = @shop_item.shop_orders.find(params[:id])
    authorize @shop_order

    render inertia: "shop_orders/show", props: {
      shop_item: { id: @shop_item.id, name: @shop_item.name, image_url: @shop_item.image_url },
      order: {
        id: @shop_order.id,
        state: @shop_order.state,
        frozen_price: @shop_order.frozen_price,
        quantity: @shop_order.quantity,
        created_at: @shop_order.created_at.strftime("%b %d, %Y")
      }
    }
  end

  def new
    @shop_order = @shop_item.shop_orders.build(user: current_user)
    authorize @shop_order

    render inertia: "shop_orders/new", props: {
      shop_item: serialize_shop_item(@shop_item),
      koi_balance: current_user.koi,
      hca_addresses: hca_formatted_addresses
    }
  end

  def create
    addresses = hca_formatted_addresses
    index = params[:address_index].to_i
    address = addresses[index]

    unless address.present?
      return redirect_back fallback_location: new_shop_item_shop_order_path(@shop_item),
        inertia: { errors: { base: [ "A valid shipping address is required" ] } }
    end

    phone = params[:phone].to_s.strip
    unless phone.present?
      return redirect_back fallback_location: new_shop_item_shop_order_path(@shop_item),
        inertia: { errors: { base: [ "A phone number is required" ] } }
    end

    quantity = params[:quantity].to_i
    quantity = 1 if quantity < 1

    @shop_order = @shop_item.shop_orders.build(address: address, phone: phone, quantity: quantity, user: current_user)
    authorize @shop_order

    # Lock the user row to prevent concurrent orders from double-spending koi
    saved = current_user.with_lock do
      balance = current_user.koi
      max_quantity = [ (balance.to_f / @shop_item.price).floor, 1 ].max
      quantity = quantity.clamp(1, max_quantity)
      @shop_order.quantity = quantity

      if balance < @shop_item.price * quantity
        @shop_order.errors.add(:base, "You don't have enough koi for this purchase")
        false
      else
        @shop_order.save
      end
    end

    if saved
      begin
        AirtableSync.sync_records!(ShopOrder, [ @shop_order ]) if ENV["AIRTABLE_API_KEY"].present?
      rescue => e
        ErrorReporter.capture_exception(e, contexts: { airtable: { shop_order_id: @shop_order.id } })
      end
      redirect_to shop_item_shop_order_path(@shop_item, @shop_order)
    else
      redirect_back fallback_location: new_shop_item_shop_order_path(@shop_item),
        inertia: { errors: @shop_order.errors.messages }
    end
  end

  private

  def set_shop_item
    @shop_item = ShopItem.find(params[:shop_item_id])
  end

  def require_enabled_item
    raise ActiveRecord::RecordNotFound unless @shop_item.available?
  end

  def hca_formatted_addresses
    (current_user.hca_identity&.dig("addresses") || []).map do |addr|
      [
        [ addr["first_name"], addr["last_name"] ].compact.join(" ").presence,
        addr["address"],
        addr["line_2"].presence,
        [ addr["city"], addr["state"], addr["postal_code"] ].compact.join(", "),
        addr["country"],
        addr["phone"].presence
      ].compact.join("\n")
    end
  end

  def serialize_shop_item(item)
    { id: item.id, name: item.name, description: item.description, price: item.price, image_url: item.image_url }
  end
end
