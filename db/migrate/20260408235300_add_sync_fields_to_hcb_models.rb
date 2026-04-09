class AddSyncFieldsToHcbModels < ActiveRecord::Migration[8.1]
  def change
    add_column :hcb_transactions, :last_synced_at, :datetime
    add_column :hcb_grant_cards, :email, :string
  end
end
