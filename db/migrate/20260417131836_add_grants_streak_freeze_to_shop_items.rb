class AddGrantsStreakFreezeToShopItems < ActiveRecord::Migration[8.1]
  def change
    add_column :shop_items, :grants_streak_freeze, :boolean, default: false, null: false
  end
end
