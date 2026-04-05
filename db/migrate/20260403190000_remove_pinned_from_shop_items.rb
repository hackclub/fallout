class RemovePinnedFromShopItems < ActiveRecord::Migration[8.1]
  def change
    remove_column :shop_items, :pinned, :boolean
  end
end
