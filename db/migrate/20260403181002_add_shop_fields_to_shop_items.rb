class AddShopFieldsToShopItems < ActiveRecord::Migration[8.1]
  def change
    add_column :shop_items, :fillout_form_url, :string
    add_column :shop_items, :enabled, :boolean, null: false, default: false
  end
end
