class RestructureCollapseTimelapses < ActiveRecord::Migration[8.1]
  def change
    # Add pending collapse tokens to users (mirrors how lapse_token works but for multiple sessions)
    add_column :users, :pending_collapse_tokens, :string, array: true, default: [], null: false

    # Reshape collapse_timelapses to match lapse_timelapses pattern:
    # only stores frozen data populated at journal-attachment time
    remove_column :collapse_timelapses, :collapse_session_id, :string
    remove_column :collapse_timelapses, :status, :string
    remove_column :collapse_timelapses, :screenshot_count, :integer
    rename_column :collapse_timelapses, :video_url, :playback_url
    change_column :collapse_timelapses, :tracked_seconds, :float
    rename_column :collapse_timelapses, :tracked_seconds, :duration

    # session_token is now the unique external identifier (like lapse_timelapse_id)
    add_index :collapse_timelapses, :session_token, unique: true
  end
end
