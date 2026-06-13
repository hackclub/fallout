class AddExcludedUntilToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :excluded_until, :date
  end
end
