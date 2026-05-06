# == Schema Information
#
# Table name: streak_goals
#
#  id                   :bigint           not null, primary key
#  discarded_at         :datetime
#  notify_streak_events :boolean          default(TRUE), not null
#  started_on           :date             not null
#  target_days          :integer          not null
#  created_at           :datetime         not null
#  updated_at           :datetime         not null
#  user_id              :bigint           not null
#
# Indexes
#
#  index_streak_goals_on_discarded_at  (discarded_at)
#  index_streak_goals_on_user_id_kept  (user_id) UNIQUE WHERE (discarded_at IS NULL)
#
# Foreign Keys
#
#  fk_rails_...  (user_id => users.id)
#
class StreakGoal < ApplicationRecord
  VALID_TARGETS = [ 3, 5, 7, 14 ].freeze

  has_paper_trail

  include Discardable

  belongs_to :user

  validates :target_days, presence: true, inclusion: { in: VALID_TARGETS }
  validates :started_on, presence: true
  validates :user_id, uniqueness: { conditions: -> { kept } } # Partial index allows multiple discarded goals per user

  def progress
    StreakDay.consecutive_days_from(user, started_on)
  end

  def completed?
    progress >= target_days
  end
end
