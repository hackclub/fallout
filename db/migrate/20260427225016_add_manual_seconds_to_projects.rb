class AddManualSecondsToProjects < ActiveRecord::Migration[8.1]
  def change
    add_column :projects, :manual_seconds, :integer, default: 0, null: false
  end
end
