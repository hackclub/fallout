class RemoveNoteFromShopItems < ActiveRecord::Migration[8.1]
  def change
    remove_column :shop_items, :note, :text
  end
end
