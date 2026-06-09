class RemoveHackerValueFromUsers < ActiveRecord::Migration[8.1]
  def change
    remove_column :users, :hacker_value, :integer, default: 0, null: false, if_exists: true
  end
end
