class ChangeShopItemsStatusDefault < ActiveRecord::Migration[8.1]
  def change
    change_column_default :shop_items, :status, from: "unavailable", to: "available"
  end
end
