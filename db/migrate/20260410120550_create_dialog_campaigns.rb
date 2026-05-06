class CreateDialogCampaigns < ActiveRecord::Migration[8.1]
  def change
    create_table :dialog_campaigns do |t|
      t.references :user, null: false, foreign_key: true
      t.string :key, null: false
      t.datetime :seen_at

      t.timestamps
    end

    add_index :dialog_campaigns, [ :user_id, :key ], unique: true
  end
end
