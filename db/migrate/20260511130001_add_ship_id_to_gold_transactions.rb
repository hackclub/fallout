class AddShipIdToGoldTransactions < ActiveRecord::Migration[8.1]
  def change
    add_reference :gold_transactions, :ship, foreign_key: true, null: true
  end
end
