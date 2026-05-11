class AddTransferIdToCurrencyTransactions < ActiveRecord::Migration[8.1]
  def change
    # Shared UUID written to both rows of a koi <-> gold transfer (e.g., built_irl_conversion).
    # Implicit cross-table linkage; lets auditors pair sides via WHERE transfer_id = ?.
    add_column :koi_transactions, :transfer_id, :uuid
    add_column :gold_transactions, :transfer_id, :uuid
    add_index :koi_transactions, :transfer_id, where: "transfer_id IS NOT NULL"
    add_index :gold_transactions, :transfer_id, where: "transfer_id IS NOT NULL"
  end
end
