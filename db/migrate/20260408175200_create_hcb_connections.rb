class CreateHcbConnections < ActiveRecord::Migration[8.1]
  def change
    create_table :hcb_connections do |t|
      t.text :access_token
      t.text :refresh_token
      t.datetime :token_expires_at
      t.string :hcb_organization_id
      t.references :connected_by, null: false, foreign_key: { to_table: :users }
      t.datetime :connected_at

      t.timestamps
    end
  end
end
