class AddSoupCampaignRecipientsCountToSoupCampaigns < ActiveRecord::Migration[8.1]
  def change
    add_column :soup_campaigns, :soup_campaign_recipients_count, :integer, default: 0, null: false

    # Backfill existing rows with a direct SQL count to avoid reflection issues in migration context
    execute <<~SQL
      UPDATE soup_campaigns
      SET soup_campaign_recipients_count = (
        SELECT COUNT(*) FROM soup_campaign_recipients
        WHERE soup_campaign_recipients.soup_campaign_id = soup_campaigns.id
      )
    SQL
  end
end
