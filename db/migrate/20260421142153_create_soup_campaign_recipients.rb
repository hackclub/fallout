class CreateSoupCampaignRecipients < ActiveRecord::Migration[8.1]
  def change
    create_table :soup_campaign_recipients do |t|
      t.bigint :soup_campaign_id, null: false
      t.string :slack_id, null: false
      t.string :display_name
      t.integer :status, null: false, default: 0
      t.datetime :sent_at
      t.text :error_message
      t.string :unsubscribe_token, null: false

      t.timestamps
    end

    add_index :soup_campaign_recipients, :soup_campaign_id
    add_index :soup_campaign_recipients, :unsubscribe_token, unique: true
    add_index :soup_campaign_recipients, [ :soup_campaign_id, :slack_id ], unique: true, name: "index_soup_recipients_on_campaign_and_slack"
    add_index :soup_campaign_recipients, :status
  end
end
