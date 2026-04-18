class AddRequiresShippingToShopItems < ActiveRecord::Migration[8.1]
  def change
    add_column :shop_items, :requires_shipping, :boolean, default: true, null: false
  end
end
