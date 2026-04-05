class AddQuantityToShopOrders < ActiveRecord::Migration[8.1]
  def change
    add_column :shop_orders, :quantity, :integer, default: 1, null: false
  end
end
