# == Schema Information
#
# Table name: soup_campaign_recipients
#
#  id                :bigint           not null, primary key
#  display_name      :string
#  error_message     :text
#  sent_at           :datetime
#  status            :integer          default("pending"), not null
#  unsubscribe_token :string           not null
#  created_at        :datetime         not null
#  updated_at        :datetime         not null
#  slack_id          :string           not null
#  soup_campaign_id  :bigint           not null
#
# Indexes
#
#  index_soup_campaign_recipients_on_soup_campaign_id   (soup_campaign_id)
#  index_soup_campaign_recipients_on_status             (status)
#  index_soup_campaign_recipients_on_unsubscribe_token  (unsubscribe_token) UNIQUE
#  index_soup_recipients_on_campaign_and_slack          (soup_campaign_id,slack_id) UNIQUE
#
class SoupCampaignRecipient < ApplicationRecord
  belongs_to :soup_campaign, counter_cache: true

  enum :status, { pending: 0, sent: 1, failed: 2, unsubscribed: 3, skipped: 4 }

  validates :slack_id, :unsubscribe_token, presence: true
  validates :unsubscribe_token, uniqueness: true

  before_validation :generate_unsubscribe_token, on: :create

  scope :unsent, -> { where(status: :pending) }

  private

  def generate_unsubscribe_token
    self.unsubscribe_token ||= SecureRandom.urlsafe_base64(24)
  end
end
