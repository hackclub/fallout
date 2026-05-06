class AddStretchMultiplierToYouTubeVideos < ActiveRecord::Migration[8.1]
  def change
    add_column :you_tube_videos, :stretch_multiplier, :integer, default: 1, null: false
  end
end
