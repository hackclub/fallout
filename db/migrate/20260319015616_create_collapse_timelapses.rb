class CreateCollapseTimelapses < ActiveRecord::Migration[8.1]
  def change
    create_table :collapse_timelapses do |t|
      t.references :user, null: false, foreign_key: true
      t.text :session_token, null: false # Encrypted at rest via ActiveRecord::Encryption
      t.string :collapse_session_id, null: false
      t.string :name
      t.string :status
      t.integer :tracked_seconds
      t.integer :screenshot_count
      t.string :video_url
      t.string :thumbnail_url
      t.datetime :last_refreshed_at

      t.timestamps
    end

    add_index :collapse_timelapses, :collapse_session_id, unique: true
  end
end
