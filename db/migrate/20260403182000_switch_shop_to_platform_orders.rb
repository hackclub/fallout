class SwitchShopToPlatformOrders < ActiveRecord::Migration[8.1]
  def change
    remove_column :shop_items, :fillout_form_url, :string
    add_column :shop_orders, :address, :text
  end
end
