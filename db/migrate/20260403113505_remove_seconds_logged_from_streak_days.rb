class RemoveSecondsLoggedFromStreakDays < ActiveRecord::Migration[8.1]
  def change
    # Guard: this column was removed from the create_streak_days migration before it ran, so it may not exist
    remove_column :streak_days, :seconds_logged, :integer, default: 0, null: false if column_exists?(:streak_days, :seconds_logged)
  end
end
