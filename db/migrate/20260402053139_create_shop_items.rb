class CreateShopItems < ActiveRecord::Migration[8.1]
  def change
    create_table :shop_items do |t|
      t.string :name
      t.text :description
      t.integer :price
      t.text :note
      t.string :image_url

      t.timestamps
    end
  end
end
