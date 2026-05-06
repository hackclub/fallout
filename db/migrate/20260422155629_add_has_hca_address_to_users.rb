class AddHasHcaAddressToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :has_hca_address, :boolean, default: false, null: false
  end
end
