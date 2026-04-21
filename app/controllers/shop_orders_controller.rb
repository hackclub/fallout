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
      shop_item: { id: @shop_item.id, name: @shop_item.name, image_url: @shop_item.image_url, currency: @shop_item.currency },
      order: {
        id: @shop_order.id,
        state: @shop_order.state,
        frozen_price: @shop_order.frozen_price,
        quantity: @shop_order.quantity,
        created_at: @shop_order.created_at.strftime("%b %d, %Y")
      },
      just_purchased: flash[:just_purchased].present?
    }
  end

  def new
    @shop_order = @shop_item.shop_orders.build(user: current_user)
    authorize @shop_order

    balance = @shop_item.currency == "gold" ? current_user.gold : current_user.koi
    if balance < @shop_item.price
      return redirect_to "/shop", inertia: { errors: { base: [ "You don't have enough #{@shop_item.currency} to buy this item" ] } }
    end

    render inertia: "shop_orders/new", props: {
      shop_item: serialize_shop_item(@shop_item),
      koi_balance: current_user.koi,
      gold_balance: current_user.gold,
      hca_addresses: @shop_item.requires_shipping? ? hca_formatted_addresses : []
    }
  end

  def create
    if @shop_item.requires_shipping?
      addresses = hca_formatted_addresses
      index = params[:address_index].to_i
      address = (index >= 0 && index < addresses.length) ? addresses[index] : nil # Reject negative/out-of-bounds indices

      unless address.present?
        return redirect_back fallback_location: new_shop_item_shop_order_path(@shop_item),
          inertia: { errors: { base: [ "A valid shipping address is required" ] } }
      end

      phone = params[:phone].to_s.strip
      unless phone.present?
        return redirect_back fallback_location: new_shop_item_shop_order_path(@shop_item),
          inertia: { errors: { base: [ "A phone number is required" ] } }
      end
    end

    quantity = params[:quantity].to_i
    quantity = 1 if quantity < 1

    @shop_order = @shop_item.shop_orders.build(address: address, phone: phone, quantity: quantity, user: current_user)
    authorize @shop_order

    # Lock the user row to prevent concurrent orders from double-spending currency
    saved = current_user.with_lock do
      @shop_item.reload # Re-read current price inside the lock
      if @shop_item.currency == "hours"
        @shop_order.errors.add(:base, "This item cannot be purchased directly")
        next false
      end

      total_cost = @shop_item.price * quantity
      balance = @shop_item.currency == "gold" ? current_user.gold : current_user.koi
      currency_name = @shop_item.currency == "gold" ? "gold" : "koi"

      if balance < total_cost
        @shop_order.errors.add(:base, "You don't have enough #{currency_name} for this purchase")
        false
      else
        @shop_order.frozen_price = @shop_item.price # Freeze the price read inside the lock
        @shop_order.quantity = quantity
        if @shop_order.save
          current_user.increment!(:streak_freezes, quantity) if @shop_item.grants_streak_freeze?
          true
        else
          false
        end
      end
    end

    if saved
      begin
        AirtableSync.sync_records!(ShopOrder, [ @shop_order ]) if ENV["AIRTABLE_API_KEY"].present?
      rescue => e
        ErrorReporter.capture_exception(e, contexts: { airtable: { shop_order_id: @shop_order.id } })
      end
      redirect_to shop_item_shop_order_path(@shop_item, @shop_order), flash: { just_purchased: true }
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
    test_address = "Test User\n123 Test Street\nToronto, ON, M5V 1A1\nCanada"
    return [ test_address ] if Rails.env.development?

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
    { id: item.id, name: item.name, description: item.description, price: item.price, image_url: item.image_url, currency: item.currency, requires_shipping: item.requires_shipping? }
  end
end
