# == Schema Information
#
# Table name: dialog_campaigns
#
#  id         :bigint           not null, primary key
#  key        :string           not null
#  seen_at    :datetime
#  created_at :datetime         not null
#  updated_at :datetime         not null
#  user_id    :bigint           not null
#
# Indexes
#
#  index_dialog_campaigns_on_user_id          (user_id)
#  index_dialog_campaigns_on_user_id_and_key  (user_id,key) UNIQUE
#
# Foreign Keys
#
#  fk_rails_...  (user_id => users.id)
#
class DialogCampaign < ApplicationRecord
  belongs_to :user

  CAMPAIGN_KEYS = %w[
    first_journal
    streak_goal_nudge
    streak_goal_completed
    shop_intro
    mail_intro
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
