class AddInactivityDmSentAtToProjects < ActiveRecord::Migration[8.1]
  def change
    add_column :projects, :inactivity_dm_sent_at, :datetime
  end
end
