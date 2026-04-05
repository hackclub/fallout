class AddTicketToShopItems < ActiveRecord::Migration[8.1]
  def change
    add_column :shop_items, :ticket, :boolean, default: false, null: false
  end
end
