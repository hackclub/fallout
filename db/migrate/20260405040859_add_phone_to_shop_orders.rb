class AddPhoneToShopOrders < ActiveRecord::Migration[8.1]
  def change
    add_column :shop_orders, :phone, :string
  end
end
