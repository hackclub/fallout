class CreateStreakGoalsTable < ActiveRecord::Migration[8.1]
  def up
    drop_table :streak_goals, if_exists: true
    execute "DROP INDEX IF EXISTS index_streak_goals_on_user_id"

    create_table :streak_goals do |t|
      t.references :user, null: false, foreign_key: true, index: { unique: true }
      t.integer :target_days, null: false
      t.date :started_on, null: false

      t.timestamps
    end
  end

  def down
    drop_table :streak_goals, if_exists: true
  end
end
