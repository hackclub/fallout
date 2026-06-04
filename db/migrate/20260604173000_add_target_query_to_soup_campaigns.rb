class AddTargetQueryToSoupCampaigns < ActiveRecord::Migration[8.1]
  def change
    add_column :soup_campaigns, :target_query, :text
  end
end
