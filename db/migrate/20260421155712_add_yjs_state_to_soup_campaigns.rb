class AddYjsStateToSoupCampaigns < ActiveRecord::Migration[8.1]
  def change
    add_column :soup_campaigns, :yjs_state, :binary
  end
end
