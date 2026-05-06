class AddRequiresShippingToShopItems < ActiveRecord::Migration[8.1]
  def change
    add_column :shop_items, :requires_shipping, :boolean, default: true, null: false
    # Existing streak freeze items don't need shipping info
    reversible do |dir|
      dir.up { ShopItem.where(grants_streak_freeze: true).update_all(requires_shipping: false) }
    end
  end
end
