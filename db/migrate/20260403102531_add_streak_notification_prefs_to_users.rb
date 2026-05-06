class AddStreakNotificationPrefsToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :streak_slack_notifications, :boolean, null: false, default: true
    add_column :users, :streak_in_app_notifications, :boolean, null: false, default: true
  end
end
