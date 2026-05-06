class AddDiscardedAtToStreakGoals < ActiveRecord::Migration[8.1]
  def change
    add_column :streak_goals, :discarded_at, :datetime
    add_index :streak_goals, :discarded_at

    # The unique index on user_id must allow multiple discarded goals per user;
    # replace it with a partial index covering only active (kept) goals.
    remove_index :streak_goals, :user_id
    add_index :streak_goals, :user_id, unique: true, where: "discarded_at IS NULL", name: "index_streak_goals_on_user_id_kept"
  end
end
