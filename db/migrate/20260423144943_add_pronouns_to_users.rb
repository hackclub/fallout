class AddPronounsToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :pronouns, :string
  end
end
