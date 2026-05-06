class CreateGoldTransactions < ActiveRecord::Migration[8.1]
  def change
    create_table :gold_transactions do |t|
      t.bigint :user_id, null: false
      t.bigint :actor_id
      t.integer :amount, null: false
      t.string :reason, null: false
      t.text :description, null: false
      t.timestamps
    end

    add_index :gold_transactions, :user_id
    add_index :gold_transactions, :actor_id
    add_index :gold_transactions, [ :user_id, :created_at ]
    add_foreign_key :gold_transactions, :users
    add_foreign_key :gold_transactions, :users, column: :actor_id
  end
end
