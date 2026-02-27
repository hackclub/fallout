class AddStiAndTrialFieldsToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :type, :string
    add_column :users, :device_token, :string
    add_index  :users, :device_token
    change_column_null :users, :slack_id, true
    change_column_null :users, :hca_id, true
    add_index :users, :email, unique: true,
      where: "type IS NULL AND discarded_at IS NULL",
      name: "index_users_unique_verified_email"
  end
end
