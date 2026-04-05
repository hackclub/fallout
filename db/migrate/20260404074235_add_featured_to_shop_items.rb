class AddFeaturedToShopItems < ActiveRecord::Migration[8.1]
  def change
    add_column :shop_items, :featured, :boolean, default: false, null: false
  end
end
