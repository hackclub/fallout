class CreateStreakGoals < ActiveRecord::Migration[8.1]
  def change
    # Guard: a later migration (20260403132242) also adds this column
    add_column :users, :streak_freezes, :integer, null: false, default: 1 unless column_exists?(:users, :streak_freezes)
  end
end
