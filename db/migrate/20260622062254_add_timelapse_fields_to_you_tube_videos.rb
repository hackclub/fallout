class AddTimelapseFieldsToYouTubeVideos < ActiveRecord::Migration[8.1]
  def change
    add_column :you_tube_videos, :processed_at, :datetime
    add_column :you_tube_videos, :timelapse_byte_size, :bigint
    add_column :you_tube_videos, :timelapse_checksum, :string
    add_column :you_tube_videos, :processing_status, :integer, null: false, default: 6
    add_column :you_tube_videos, :processing_progress, :integer, null: false, default: 0
    add_column :you_tube_videos, :processing_error, :text
    add_column :you_tube_videos, :timelapse_duration_seconds, :integer
  end
end
