class AddNotifyStreakEventsToStreakGoals < ActiveRecord::Migration[8.1]
  def change
    add_column :streak_goals, :notify_streak_events, :boolean, null: false, default: true
  end
end
