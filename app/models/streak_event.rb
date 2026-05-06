# == Schema Information
#
# Table name: streak_events
#
#  id          :bigint           not null, primary key
#  dialog_seen :boolean          default(FALSE), not null
#  event_type  :string           not null
#  metadata    :jsonb            not null
#  created_at  :datetime         not null
#  updated_at  :datetime         not null
#  user_id     :bigint           not null
#
# Indexes
#
#  index_streak_events_on_user_id                 (user_id)
#  index_streak_events_on_user_id_and_event_type  (user_id,event_type)
#
# Foreign Keys
#
#  fk_rails_...  (user_id => users.id)
#
class StreakEvent < ApplicationRecord
  belongs_to :user

  EVENT_TYPES = %w[
    day_completed
    freeze_used
    freeze_earned
    streak_broken
    streak_milestone
    goal_completed
    goal_broken
  ].freeze

  validates :event_type, presence: true, inclusion: { in: EVENT_TYPES }
end
