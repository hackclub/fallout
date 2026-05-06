# == Schema Information
#
# Table name: you_tube_videos
#
#  id                     :bigint           not null, primary key
#  activity_checked_at    :datetime
#  caption                :boolean
#  channel_title          :string
#  definition             :string
#  description            :text
#  duration_seconds       :integer
#  inactive_frame_count   :integer
#  inactive_percentage    :float
#  inactive_segments      :jsonb
#  last_refreshed_at      :datetime
#  live_broadcast_content :string
#  published_at           :datetime
#  stretch_multiplier     :integer          default(1), not null
#  tags                   :text
#  thumbnail_url          :string
#  title                  :string
#  was_live               :boolean          default(FALSE)
#  created_at             :datetime         not null
#  updated_at             :datetime         not null
#  category_id            :string
#  channel_id             :string
#  video_id               :string           not null
#
# Indexes
#
#  index_you_tube_videos_on_video_id  (video_id) UNIQUE
#
class YouTubeVideo < ApplicationRecord
  has_one :recording, as: :recordable, dependent: :destroy # Destroying a video removes its journal link

  validates :video_id, presence: true

  serialize :tags, coder: JSON

  scope :by_video_id, ->(vid) { where(video_id: vid) }

  def youtube_url
    "https://www.youtube.com/watch?v=#{video_id}"
  end

  def thumbnail_url_for(quality: "maxresdefault")
    YouTubeService.thumbnail_url_from_id(video_id, quality: quality)
  end

  def refetch_data!
    attrs = YouTubeService.fetch_video_data(video_id)
    raise YouTubeService::Error, "YouTube video #{video_id} not found" unless attrs

    update!(attrs.except(:video_id).merge(last_refreshed_at: Time.current))
  end
end
