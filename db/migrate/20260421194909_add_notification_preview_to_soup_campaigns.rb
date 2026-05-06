class AddNotificationPreviewToSoupCampaigns < ActiveRecord::Migration[8.1]
  def change
    add_column :soup_campaigns, :notification_preview, :string
  end
end
