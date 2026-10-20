class AddBirthdayToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :birthday, :date
  end
end
