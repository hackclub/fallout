class AddHcaIdToUsers < ActiveRecord::Migration[8.0]
  def change
    add_column :users, :hca_id, :string
    add_index :users, :hca_id, unique: true

    # Make slack_id nullable for transition to HCA
    change_column_null :users, :slack_id, true
  end
end
