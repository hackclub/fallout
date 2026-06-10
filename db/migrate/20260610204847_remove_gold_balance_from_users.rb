class RemoveGoldBalanceFromUsers < ActiveRecord::Migration[8.1]
  # users.gold_balance was a denormalized counter cache. Gold is now recomputed live from the
  # GoldTransaction ledger minus gold shop/grant spend (User#gold), mirroring User#koi, so the
  # column is unread. Reversible: rollback restores the column with its original default/null.
  #
  # DEPLOY ORDER: ship the code that stops reading/writing this column (User#gold switch +
  # removal of the GoldTransaction/ShopOrder/ProjectGrantOrder counter callbacks) BEFORE running
  # this migration, or in-flight old pods will error writing a dropped column.
  def change
    remove_column :users, :gold_balance, :integer, default: 0, null: false
  end
end
