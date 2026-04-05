class AddFieldsToShopItems < ActiveRecord::Migration[8.1]
  def change
    add_column :shop_items, :price, :integer
    add_column :shop_items, :note, :text
    add_column :shop_items, :image_url, :string
  end
end
