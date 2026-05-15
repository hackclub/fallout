class AddSelectedDatesToShopOrders < ActiveRecord::Migration[8.1]
  def change
    add_column :shop_orders, :selected_dates, :text, array: true, default: []
  end
end
