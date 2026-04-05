class ReplaceEnabledWithStatusOnShopItems < ActiveRecord::Migration[8.1]
  def change
    remove_column :shop_items, :enabled, :boolean
    add_column :shop_items, :status, :string, null: false, default: "unavailable"
    add_index :shop_items, :status
  end
end
