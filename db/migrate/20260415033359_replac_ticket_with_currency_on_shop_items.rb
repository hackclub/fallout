class ReplacTicketWithCurrencyOnShopItems < ActiveRecord::Migration[8.1]
  def up
    add_column :shop_items, :currency, :string, default: "koi", null: false

    # Migrate existing ticket items to hours currency
    execute "UPDATE shop_items SET currency = 'hours' WHERE ticket = TRUE"

    remove_column :shop_items, :ticket
  end

  def down
    add_column :shop_items, :ticket, :boolean, default: false, null: false

    execute "UPDATE shop_items SET ticket = TRUE WHERE currency = 'hours'"

    remove_column :shop_items, :currency
  end
end
