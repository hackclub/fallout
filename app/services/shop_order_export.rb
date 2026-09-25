# frozen_string_literal: true

require "csv"

# Builds the admin CSV export for shop orders. Two shapes:
#   orders   — one row per ShopOrder
#   packages — orders combined per buyer + shipping address, quantities summed per item, so a
#              buyer who ordered "Stickers" twice (or once with quantity 2) becomes one row.
# Contains shipping PII (name, phone, address) — admin-only callers.
class ShopOrderExport
  GROUPS = %w[orders packages].freeze
  ADDRESS_FIELDS = %w[first_name last_name line_1 line_2 city state postal_code country].freeze

  attr_reader :group, :min_quantity

  def initialize(scope, group: "orders", min_quantity: nil)
    @scope = scope.includes(:user, :shop_item).order(:created_at)
    @group = GROUPS.include?(group) ? group : "orders"
    @min_quantity = min_quantity.to_i.positive? ? min_quantity.to_i : nil
  end

  def orders
    @orders ||= @scope.to_a
  end

  def rows
    @rows ||= group == "packages" ? package_rows : order_rows
  end

  def headers
    @headers ||= rows.first&.keys || (group == "packages" ? package_row(nil, []).keys : order_row(nil).keys)
  end

  def to_csv
    CSV.generate do |csv|
      csv << headers
      rows.each { |row| csv << headers.map { |h| row[h] } }
    end
  end

  def filename
    "shop_#{group}_#{Time.current.strftime('%Y%m%d_%H%M%S')}.csv"
  end

  private

  def order_rows
    orders.filter_map do |order|
      next if min_quantity && order.quantity < min_quantity
      order_row(order)
    end
  end

  def order_row(order)
    {
      "order_id" => order&.id,
      "state" => order&.state,
      "user_id" => order&.user_id,
      "name" => order&.user&.display_name,
      "email" => order&.user&.email,
      "phone" => order&.phone,
      **address_columns(order),
      "item" => order&.shop_item&.name,
      "quantity" => order&.quantity,
      "unit_price" => order&.frozen_price,
      "currency" => order&.shop_item&.currency,
      "total" => order && order.frozen_price * order.quantity,
      "koi_paid" => order&.frozen_koi_amount,
      "gold_paid" => order&.frozen_gold_amount,
      "requires_shipping" => order&.shop_item&.requires_shipping,
      "selected_dates" => Array(order&.selected_dates).join(", "),
      "ordered_at" => order&.created_at&.iso8601,
      "admin_note" => order&.admin_note
    }
  end

  # One package per buyer + address (a user with two addresses on file gets two rows, since
  # each needs its own shipment). Items are combined by summing quantities.
  def package_rows
    item_names = orders.map { |o| o.shop_item.name }.uniq.sort
    orders.group_by { |o| [ o.user_id, o.address.to_s ] }.filter_map do |_key, group_orders|
      row = package_row(group_orders.first, group_orders, item_names)
      next if min_quantity && row["total_quantity"] < min_quantity
      row
    end
  end

  def package_row(sample, group_orders, item_names = [])
    quantities = group_orders.each_with_object(Hash.new(0)) { |o, h| h[o.shop_item.name] += o.quantity }
    {
      "user_id" => sample&.user_id,
      "name" => sample&.user&.display_name,
      "email" => sample&.user&.email,
      "phone" => sample&.phone,
      **address_columns(sample),
      "items" => quantities.map { |name, qty| "#{qty}x #{name}" }.join(", "),
      "total_quantity" => quantities.values.sum,
      **item_names.to_h { |name| [ "qty_#{name.parameterize(separator: '_')}", quantities[name] ] },
      "orders" => group_orders.size,
      "order_ids" => group_orders.map(&:id).join(", "),
      "states" => group_orders.map(&:state).uniq.join(", "),
      "koi_paid" => group_orders.sum(&:frozen_koi_amount),
      "gold_paid" => group_orders.sum(&:frozen_gold_amount),
      "selected_dates" => group_orders.flat_map { |o| Array(o.selected_dates) }.uniq.join(", "),
      "first_ordered_at" => group_orders.map(&:created_at).min&.iso8601,
      "last_ordered_at" => group_orders.map(&:created_at).max&.iso8601,
      "admin_notes" => group_orders.filter_map { |o| o.admin_note.presence }.join(" | ")
    }
  end

  def address_columns(order)
    structured = order&.structured_address.presence || {}
    ADDRESS_FIELDS.to_h { |f| [ "address_#{f}", structured[f] ] }
      .merge("address_legacy" => structured.blank? ? order&.legacy_address : nil)
  end
end
