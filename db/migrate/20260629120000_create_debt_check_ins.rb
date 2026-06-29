class CreateDebtCheckIns < ActiveRecord::Migration[8.1]
  def change
    create_table :debt_check_ins do |t|
      t.references :user, null: false, foreign_key: true # the debtor being checked in on
      t.references :author, null: false, foreign_key: { to_table: :users } # the admin who logged the check-in
      t.text :note, null: false
      t.datetime :discarded_at # soft-delete so check-in history stays auditable/recoverable

      t.timestamps
    end

    add_index :debt_check_ins, :discarded_at
    # Roster preloads check-ins per debtor ordered newest-first; this covers that lookup.
    add_index :debt_check_ins, [ :user_id, :created_at ]
  end
end
