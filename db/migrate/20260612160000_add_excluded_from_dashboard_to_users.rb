class AddExcludedFromDashboardToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :excluded_from_dashboard, :boolean, default: false, null: false
  end
end
