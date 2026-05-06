class AddImageUrlToSoupCampaigns < ActiveRecord::Migration[8.1]
  def change
    add_column :soup_campaigns, :image_url, :string
  end
end
