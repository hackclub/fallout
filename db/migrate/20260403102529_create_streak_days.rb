class CreateStreakDays < ActiveRecord::Migration[8.1]
  def change
    create_table :streak_days do |t|
      t.references :user, null: false, foreign_key: true
      t.date :date, null: false
      t.integer :status, null: false, default: 0

      t.timestamps
    end

    add_index :streak_days, [ :user_id, :date ], unique: true
  end
end
