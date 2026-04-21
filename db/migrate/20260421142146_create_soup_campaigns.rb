class CreateSoupCampaigns < ActiveRecord::Migration[8.1]
  def change
    create_table :soup_campaigns do |t|
      t.string :name, null: false
      t.text :body, null: false
      t.text :footer
      t.integer :status, null: false, default: 0
      t.datetime :sent_at
      t.datetime :scheduled_at
      t.bigint :created_by_id, null: false
      t.string :unsubscribe_token, null: false

      t.timestamps
    end

    add_index :soup_campaigns, :unsubscribe_token, unique: true
    add_index :soup_campaigns, :status
    add_index :soup_campaigns, :created_by_id
  end
end
