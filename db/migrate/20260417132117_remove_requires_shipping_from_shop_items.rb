class RemoveRequiresShippingFromShopItems < ActiveRecord::Migration[8.1]
  def change
    remove_column :shop_items, :requires_shipping, :boolean, default: true, null: false
  end
end
