class UpdateUsersForEncryption < ActiveRecord::Migration[8.0]
  def change
    remove_column :users, :address, :string
    remove_column :users, :birthdate, :string
    add_column :users, :hca_token, :text
    add_column :users, :is_adult, :boolean, default: false, null: false
  end
end
