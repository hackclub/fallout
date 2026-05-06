class AddDialogSeenToStreakEvents < ActiveRecord::Migration[8.1]
  def change
    add_column :streak_events, :dialog_seen, :boolean, null: false, default: false
  end
end
