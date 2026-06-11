# == Schema Information
#
# Table name: lapse_timelapses
#
#  id                      :bigint           not null, primary key
#  activity_checked_at     :datetime
#  archive_checksum        :string
#  archive_video_byte_size :bigint
#  archived_at             :datetime
#  description             :text
#  duration                :float
#  inactive_frame_count    :integer
#  inactive_percentage     :float
#  inactive_segments       :jsonb
#  is_published            :boolean
#  lapse_created_at        :datetime
#  last_refreshed_at       :datetime
#  name                    :string
#  owner_handle            :string
#  playback_url            :string
#  thumbnail_url           :string
#  video_container_kind    :string
#  visibility              :string
#  created_at              :datetime         not null
#  updated_at              :datetime         not null
#  lapse_timelapse_id      :string           not null
#  owner_lapse_id          :string
#  user_id                 :bigint           not null
#
# Indexes
#
#  index_lapse_timelapses_on_lapse_timelapse_id  (lapse_timelapse_id) UNIQUE
#  index_lapse_timelapses_on_user_id             (user_id)
#
# Foreign Keys
#
#  fk_rails_...  (user_id => users.id)
#
class LapseTimelapse < ApplicationRecord
  # Visibilities allowed to back a journal entry. Anything else (FAILED_PROCESSING,
  # still-rendering, private, etc.) must not be attachable — see #attachable?.
  ATTACHABLE_VISIBILITIES = %w[PUBLIC UNLISTED].freeze

  belongs_to :user
  has_one :recording, as: :recordable, dependent: :destroy # Destroying a timelapse removes its journal link

  validates :lapse_timelapse_id, presence: true, uniqueness: true

  def fetch_data
    token = user.lapse_token.presence || ENV.fetch("LAPSE_PROGRAM_KEY", nil)
    LapseService.fetch_timelapse(token, lapse_timelapse_id)
  end

  def refetch_data!
    data = fetch_data
    raise ActiveRecord::RecordNotFound, "Timelapse #{lapse_timelapse_id} not found on Lapse" unless data

    update!(
      name: data["name"],
      description: data["description"],
      visibility: data["visibility"],
      is_published: data["isPublished"],
      playback_url: data["playbackUrl"],
      thumbnail_url: data["thumbnailUrl"],
      video_container_kind: data["videoContainerKind"],
      duration: data["duration"],
      lapse_created_at: data["createdAt"] ? Time.at(data["createdAt"] / 1000.0).utc : nil,
      owner_lapse_id: data.dig("owner", "id"),
      owner_handle: data.dig("owner", "handle"),
      last_refreshed_at: Time.current
    )
  end

  # Gate for attaching to a journal entry: Lapse must have actually rendered a video
  # (playback_url present) and the timelapse must be public/unlisted — never a
  # failed-processing or footage-less render. Enforced at attach time so logged hours
  # always have real, viewable footage behind them. Call after refetch_data!.
  def attachable?
    playback_url.present? && ATTACHABLE_VISIBILITIES.include?(visibility)
  end
end
