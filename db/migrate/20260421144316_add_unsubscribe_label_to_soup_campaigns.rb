class AddUnsubscribeLabelToSoupCampaigns < ActiveRecord::Migration[8.1]
  def change
    add_column :soup_campaigns, :unsubscribe_label, :string,
      null: false,
      default: "Important program related announcement | Unsubscribe"
  end
end
