# == Schema Information
#
# Table name: shop_items
#
#  id                   :bigint           not null, primary key
#  currency             :string           default("koi"), not null
#  description          :text
#  featured             :boolean          default(FALSE), not null
#  grants_streak_freeze :boolean          default(FALSE), not null
#  image_url            :string
#  name                 :string
#  price                :integer
#  requires_shipping    :boolean          default(TRUE), not null
#  status               :string           default("available"), not null
#  ticket               :boolean          default(FALSE), not null
#  created_at           :datetime         not null
#  updated_at           :datetime         not null
#
# Indexes
#
#  index_shop_items_on_status  (status)
#
class ShopItem < ApplicationRecord
  STATUSES = %w[available unavailable].freeze
  CURRENCIES = %w[koi gold hours].freeze

  has_many :shop_orders, dependent: :restrict_with_error

  enum :status, { available: "available", unavailable: "unavailable" }, default: "available"

  validates :name, :price, presence: true
  validates :price, numericality: { greater_than: 0 }
  validates :status, inclusion: { in: STATUSES }
  validates :currency, inclusion: { in: CURRENCIES }
end
