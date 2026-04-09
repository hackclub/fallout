class RemoveHcbOrganizationIdFromHcbConnections < ActiveRecord::Migration[8.1]
  def change
    remove_column :hcb_connections, :hcb_organization_id, :string
  end
end
