class AddShipToKoiTransactions < ActiveRecord::Migration[8.1]
  # Concurrent index requires running outside a transaction.
  disable_ddl_transaction!

  def up
    unless column_exists?(:koi_transactions, :ship_id)
      add_column :koi_transactions, :ship_id, :bigint
    end

    # Partial unique index: enforces at most one ship_review koi transaction per ship.
    # The DB-level guarantee is the ultimate idempotency safeguard for koi awarding —
    # koi flows downstream into HCB grant orders, so a double-award is real money.
    unless index_exists?(:koi_transactions, :ship_id,
                        name: "index_koi_transactions_on_ship_review_uniqueness")
      add_index :koi_transactions, :ship_id,
                unique: true,
                where: "reason = 'ship_review' AND ship_id IS NOT NULL",
                name: "index_koi_transactions_on_ship_review_uniqueness",
                algorithm: :concurrently
    end

    unless foreign_key_exists?(:koi_transactions, :ships)
      add_foreign_key :koi_transactions, :ships, validate: true
    end
  end

  def down
    if foreign_key_exists?(:koi_transactions, :ships)
      remove_foreign_key :koi_transactions, :ships
    end
    remove_index :koi_transactions,
                 name: "index_koi_transactions_on_ship_review_uniqueness",
                 if_exists: true
    remove_column :koi_transactions, :ship_id, if_exists: true
  end
end
