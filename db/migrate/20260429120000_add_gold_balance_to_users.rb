class AddGoldBalanceToUsers < ActiveRecord::Migration[8.1]
  def up
    add_column :users, :gold_balance, :integer, null: false, default: 0

    User.find_each do |user|
      balance = user.gold_transactions.sum(:amount) -
        user.shop_orders.joins(:shop_item).where(shop_items: { currency: "gold" }).where.not(state: :rejected).sum("frozen_price * quantity")
      user.update_column(:gold_balance, balance)
    end
  end

  def down
    remove_column :users, :gold_balance
  end
end
