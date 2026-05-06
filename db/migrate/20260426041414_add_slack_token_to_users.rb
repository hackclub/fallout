class AddSlackTokenToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :slack_token, :text
  end
end
