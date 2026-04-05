class CreateShopOrders < ActiveRecord::Migration[8.1]
  def change
    create_table :shop_orders do |t|
      t.references :user, null: false, foreign_key: true
      t.references :shop_item, null: false, foreign_key: true
      t.integer :frozen_price, null: false
      t.string :state, null: false, default: "pending"
      t.text :admin_note

      t.timestamps
    end

    add_index :shop_orders, :state
  end
end
