class AddRequiresDateSelectionToShopItems < ActiveRecord::Migration[8.1]
  def change
    add_column :shop_items, :requires_date_selection, :boolean, default: false, null: false
  end
end
