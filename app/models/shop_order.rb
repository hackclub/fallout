# == Schema Information
#
# Table name: shop_orders
#
#  id           :bigint           not null, primary key
#  address      :text
#  admin_note   :text
#  frozen_price :integer          not null
#  phone        :text
#  quantity     :integer          default(1), not null
#  state        :string           default("pending"), not null
#  created_at   :datetime         not null
#  updated_at   :datetime         not null
#  shop_item_id :bigint           not null
#  user_id      :bigint           not null
#
# Indexes
#
#  index_shop_orders_on_shop_item_id  (shop_item_id)
#  index_shop_orders_on_state         (state)
#  index_shop_orders_on_user_id       (user_id)
#
# Foreign Keys
#
#  fk_rails_...  (shop_item_id => shop_items.id)
#  fk_rails_...  (user_id => users.id)
#
class ShopOrder < ApplicationRecord
  # Shipping PII of minors — encrypted at rest. Never queried, so non-deterministic.
  encrypts :phone
  encrypts :address

  belongs_to :user
  belongs_to :shop_item

  enum :state, { pending: "pending", fulfilled: "fulfilled", rejected: "rejected", on_hold: "on_hold" }, default: "pending"

  before_validation :freeze_price, on: :create

  validates :frozen_price, presence: true, numericality: { greater_than: 0 }
  validates :quantity, presence: true, numericality: { greater_than: 0, only_integer: true }
  validates :address, presence: true, if: -> { shop_item&.requires_shipping? }
  validates :phone, presence: true, if: -> { shop_item&.requires_shipping? }
  validate :phone_digit_count
  validate :user_can_afford, on: :create

  def self.airtable_sync_base_id
    "appQgtRNTHxDGko9K"
  end

  def self.airtable_sync_table_id
    "tblGaPEEZJGErZxDo"
  end

  def self.airtable_sync_field_mappings
    {
      "order_id"            => :id,
      "verification_status" => ->(o) { o.user.verification_status },
      "user"                => ->(o) { o.user.display_name },
      "address"             => :address,
      "created_at"          => ->(o) { o.created_at&.iso8601 },
      "item"                => ->(o) { o.shop_item&.name },
      "quantity"            => :quantity,
      "phone_number"        => :phone,
      "status"              => :state
    }
  end

  private

  def freeze_price
    self.frozen_price ||= shop_item&.price
  end

  def phone_digit_count
    return unless phone && shop_item&.requires_shipping?
    errors.add(:phone, "must be a valid phone number") unless phone.gsub(/\D/, "").length.between?(7, 15)
  end

  def user_can_afford
    return unless user && shop_item && frozen_price && quantity
    return if user.trial? # trial users are blocked at policy level

    total_cost = frozen_price * quantity
    case shop_item.currency
    when "gold"
      errors.add(:base, "You don't have enough gold for this purchase") if user.gold < total_cost
    when "hours"
      errors.add(:base, "This item cannot be purchased directly")
    else
      errors.add(:base, "You don't have enough koi for this purchase") if user.koi < total_cost
    end
  end
end
