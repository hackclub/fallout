# == Schema Information
#
# Table name: soup_campaigns
#
#  id                             :bigint           not null, primary key
#  body                           :text             not null
#  footer                         :text
#  image_url                      :string
#  name                           :string           not null
#  notification_preview           :string
#  scheduled_at                   :datetime
#  sent_at                        :datetime
#  soup_campaign_recipients_count :integer          default(0), not null
#  status                         :integer          default("draft"), not null
#  unsubscribe_label              :string           default("Important program related announcement | Unsubscribe"), not null
#  unsubscribe_token              :string           not null
#  yjs_state                      :binary
#  created_at                     :datetime         not null
#  updated_at                     :datetime         not null
#  created_by_id                  :bigint           not null
#
# Indexes
#
#  index_soup_campaigns_on_created_by_id      (created_by_id)
#  index_soup_campaigns_on_status             (status)
#  index_soup_campaigns_on_unsubscribe_token  (unsubscribe_token) UNIQUE
#
class SoupCampaign < ApplicationRecord
  DEFAULT_UNSUBSCRIBE_LABEL = "Important program related announcement | Unsubscribe"

  belongs_to :created_by, class_name: "User"
  has_many :soup_campaign_recipients, dependent: :destroy

  enum :status, { draft: 0, sending: 1, sent: 2, cancelled: 3 }

  validates :name, :unsubscribe_label, presence: true
  validates :unsubscribe_token, presence: true, uniqueness: true

  before_validation :generate_unsubscribe_token, on: :create

  scope :recent, -> { order(created_at: :desc) }

  def recipient_stats
    totals = soup_campaign_recipients
      .group(:status)
      .count
      .transform_keys { |k| SoupCampaignRecipient.statuses.key(k) }

    {
      total: soup_campaign_recipients_count,
      pending: totals["pending"].to_i,
      sent: totals["sent"].to_i,
      failed: totals["failed"].to_i,
      unsubscribed: totals["unsubscribed"].to_i,
      skipped: totals["skipped"].to_i
    }
  end

  def progress_percent
    total = soup_campaign_recipients_count
    return 0 if total.zero?

    done = soup_campaign_recipients.where(status: %i[sent failed skipped unsubscribed]).count
    (done.to_f / total * 100).round
  end

  private

  def generate_unsubscribe_token
    self.unsubscribe_token ||= SecureRandom.urlsafe_base64(24)
  end
end
