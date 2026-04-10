class DialogCampaign < ApplicationRecord
  belongs_to :user

  CAMPAIGN_KEYS = %w[
    first_journal
    streak_goal_nudge
    streak_goal_completed
  ].freeze

  validates :key, presence: true, inclusion: { in: CAMPAIGN_KEYS }
  validates :user_id, uniqueness: { scope: :key }

  scope :seen, -> { where.not(seen_at: nil) }
  scope :unseen, -> { where(seen_at: nil) }

  def seen?
    seen_at.present?
  end

  def mark_seen!
    update!(seen_at: Time.current)
  end
end
