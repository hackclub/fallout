class CreateKoiTransactions < ActiveRecord::Migration[8.1]
  def change
    create_table :koi_transactions do |t|
      t.references :user, null: false, foreign_key: true
      t.references :actor, null: false, foreign_key: { to_table: :users }
      t.integer :amount, null: false
      t.string :reason, null: false
      t.text :description, null: false

      t.datetime :created_at, null: false
    end

    add_index :koi_transactions, [ :user_id, :created_at ]
  end
end
