class RemovePhoneFromUsers < ActiveRecord::Migration[8.0]
  def change
    remove_column :users, :phone, :string
  end
end
