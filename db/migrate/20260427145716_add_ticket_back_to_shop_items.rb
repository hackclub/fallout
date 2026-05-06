class AddTicketBackToShopItems < ActiveRecord::Migration[8.1]
  def change
    add_column :shop_items, :ticket, :boolean, default: false, null: false
    execute "UPDATE shop_items SET ticket = TRUE WHERE currency = 'hours'"
  end
end
