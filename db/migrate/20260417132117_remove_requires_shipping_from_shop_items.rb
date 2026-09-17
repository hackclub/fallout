class RemoveRequiresShippingFromShopItems < ActiveRecord::Migration[8.1]
  def up
    # Guarded: the column was never added by an earlier migration, so it is absent on a fresh database.
    remove_column :shop_items, :requires_shipping if column_exists?(:shop_items, :requires_shipping)
  end

  def down
    add_column :shop_items, :requires_shipping, :boolean, default: true, null: false unless column_exists?(:shop_items, :requires_shipping)
  end
end
