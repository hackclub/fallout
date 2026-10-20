class AddButtonsToSoupCampaigns < ActiveRecord::Migration[8.1]
  def change
    add_column :soup_campaigns, :buttons_text, :text
    add_column :soup_campaigns, :buttons, :jsonb, default: [], null: false
  end
end
