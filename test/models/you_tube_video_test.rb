# == Schema Information
#
# Table name: you_tube_videos
#
#  id                         :bigint           not null, primary key
#  activity_checked_at        :datetime
#  caption                    :boolean
#  channel_title              :string
#  definition                 :string
#  description                :text
#  duration_seconds           :integer
#  inactive_frame_count       :integer
#  inactive_percentage        :float
#  inactive_segments          :jsonb
#  last_refreshed_at          :datetime
#  live_broadcast_content     :string
#  processed_at               :datetime
#  processing_error           :text
#  processing_progress        :integer          default(0), not null
#  processing_status          :integer          default("unqueued"), not null
#  published_at               :datetime
#  stretch_multiplier         :integer          default(1), not null
#  tags                       :text
#  thumbnail_url              :string
#  timelapse_byte_size        :bigint
#  timelapse_checksum         :string
#  timelapse_duration_seconds :integer
#  title                      :string
#  was_live                   :boolean          default(FALSE)
#  created_at                 :datetime         not null
#  updated_at                 :datetime         not null
#  category_id                :string
#  channel_id                 :string
#  video_id                   :string           not null
#
# Indexes
#
#  index_you_tube_videos_on_video_id  (video_id) UNIQUE
#
require "test_helper"

class YouTubeVideoTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
