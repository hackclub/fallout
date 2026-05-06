class EncryptShopOrderPii < ActiveRecord::Migration[8.1]
  def up
    # Rails encrypted columns need text width; `phone` is currently string (255 bytes max).
    change_column :shop_orders, :phone, :text

    # Per 2026-04-23 decision: existing shipping info doesn't need to be retained.
    # Null out plaintext so nothing sensitive remains; new orders will be encrypted.
    execute "UPDATE shop_orders SET phone = NULL, address = NULL"
  end

  def down
    change_column :shop_orders, :phone, :string
  end
end
