class AddHackerValueToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :hacker_value, :integer, default: 0, null: false
  end
end
