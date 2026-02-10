class AddHcaFieldsToUsers < ActiveRecord::Migration[8.0]
  def change
    add_column :users, :phone, :string
    add_column :users, :birthdate, :string
    add_column :users, :address, :string
    add_column :users, :verification_status, :string
  end
end
