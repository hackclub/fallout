class CreateHcbGrantCards < ActiveRecord::Migration[8.1]
  def change
    create_table :hcb_grant_cards do |t|
      t.references :user, null: false, foreign_key: true
      t.string :hcb_id, null: false
      t.string :status, null: false, default: "active"
      t.integer :amount_cents, null: false
      t.integer :balance_cents
      t.string :purpose
      t.boolean :one_time_use, default: false, null: false
      t.string :card_id
      t.string :last4
      t.date :expires_on
      t.boolean :merchant_lock, default: false, null: false
      t.boolean :category_lock, default: false, null: false
      t.string :keyword_lock
      t.datetime :last_synced_at
      t.datetime :canceled_at

      t.timestamps
    end

    add_index :hcb_grant_cards, :hcb_id, unique: true
    add_index :hcb_grant_cards, [ :user_id, :status ]
    add_index :hcb_grant_cards, :user_id, unique: true,
              where: "status = 'active'",
              name: "index_hcb_grant_cards_on_user_id_active_unique"
  end
end
