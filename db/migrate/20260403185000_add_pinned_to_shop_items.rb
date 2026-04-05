class AddPinnedToShopItems < ActiveRecord::Migration[8.1]
  def change
    add_column :shop_items, :pinned, :boolean, null: false, default: false
  end
end
