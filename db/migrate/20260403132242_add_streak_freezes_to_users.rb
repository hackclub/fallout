class AddStreakFreezesToUsers < ActiveRecord::Migration[8.1]
  def change
    # Guard: an earlier migration (20260403102528) may have already added this column
    add_column :users, :streak_freezes, :integer, null: false, default: 1 unless column_exists?(:users, :streak_freezes)
  end
end
