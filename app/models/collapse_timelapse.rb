# == Schema Information
#
# Table name: collapse_timelapses
#
#  id                  :bigint           not null, primary key
#  last_refreshed_at   :datetime
#  name                :string
#  screenshot_count    :integer
#  session_token       :text             not null
#  status              :string
#  thumbnail_url       :string
#  tracked_seconds     :integer
#  video_url           :string
#  created_at          :datetime         not null
#  updated_at          :datetime         not null
#  collapse_session_id :string           not null
#  user_id             :bigint           not null
#
# Indexes
#
#  index_collapse_timelapses_on_collapse_session_id  (collapse_session_id) UNIQUE
#  index_collapse_timelapses_on_user_id              (user_id)
#
# Foreign Keys
#
#  fk_rails_...  (user_id => users.id)
#
class CollapseTimelapse < ApplicationRecord
  belongs_to :user
  has_one :recording, as: :recordable, dependent: :destroy

  validates :collapse_session_id, presence: true, uniqueness: true
  validates :session_token, presence: true

  def fetch_data
    CollapseService.get_session(session_token)
  end

  def refetch_data!
    data = fetch_data
    raise ActiveRecord::RecordNotFound, "Collapse session #{collapse_session_id} not found" unless data

    update!(
      name: data["name"].presence || name,
      status: data["status"],
      tracked_seconds: data["trackedSeconds"],
      screenshot_count: data["screenshotCount"],
      video_url: data["videoUrl"],
      thumbnail_url: data["thumbnailUrl"],
      last_refreshed_at: Time.current
    )
  end
end
