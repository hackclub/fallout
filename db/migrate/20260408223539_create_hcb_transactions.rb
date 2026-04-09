class CreateHcbTransactions < ActiveRecord::Migration[8.1]
  def change
    create_table :hcb_transactions do |t|
      t.references :hcb_grant_card, null: false, foreign_key: true
      t.string :hcb_id, null: false
      t.integer :amount_cents, null: false
      t.string :memo
      t.string :merchant_name
      t.datetime :transaction_date, null: false
      t.boolean :pending, default: false, null: false
      t.boolean :declined, default: false, null: false
      t.boolean :reversed, default: false, null: false

      t.timestamps
    end

    add_index :hcb_transactions, :hcb_id, unique: true
    add_index :hcb_transactions, [ :hcb_grant_card_id, :transaction_date ],
              name: "index_hcb_transactions_on_card_and_date"
  end
end
