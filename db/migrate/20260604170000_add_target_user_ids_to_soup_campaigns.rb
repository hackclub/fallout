class AddTargetUserIdsToSoupCampaigns < ActiveRecord::Migration[8.1]
  def change
    add_column :soup_campaigns, :target_user_ids, :integer, array: true, default: [], null: false
  end
end
