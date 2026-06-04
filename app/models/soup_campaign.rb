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
#  target_query                   :text
#  target_user_ids                :integer          default([]), not null, is an Array
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
  FALLOUT_CHANNEL_ID = "C037157AL30"
  HOURS_BATCH_SIZE = 200
  BLOCKLIST = %w[
    U04KEK4TS72 U06PR6B8D37 U082DPCGPST U07FCRNHS1J U0823F39GV8
    U05JNJZJ0BS U09U8US2XU6 U0261EB1EG7 U08RWM5U4L9 U078DFX40A2
    U09Q8MLTE58 U06T30DNB3L UDK5M9Y13 U07HEH4N8UV U081RE37QEB
    U07BLJ1MBEE U07UBCSSQH3 U04QD71QWS0 U09UQ385LSG U09ULFV88KU
    U05EZRFKRV4 U07BN55GN3D U078J6H1XL3 U093FC28A82 U06U80G86H1
    U07ACECRYM6 U080A3QP42C U03UBRVG2MS U07DJMFAQQP U09UE480JHH
  ].freeze

  belongs_to :created_by, class_name: "User"
  has_many :soup_campaign_recipients, dependent: :destroy

  enum :status, { draft: 0, sending: 1, sent: 2, cancelled: 3 }

  validates :name, :unsubscribe_label, presence: true
  validates :unsubscribe_token, presence: true, uniqueness: true
  # Rendered into <img src>; restrict to https:// so javascript:/data: URLs can't reach the DOM.
  # Anchored at both ends (\A and \z) and no newlines — required to pass brakeman's ValidationRegex.
  validates :image_url, format: { with: /\Ahttps:\/\/[^\s]*\z/, message: "must start with https://" }, allow_blank: true

  before_validation :generate_unsubscribe_token, on: :create
  before_validation :normalize_target_user_ids

  scope :recent, -> { order(created_at: :desc) }

  def self.parse_target_query(value)
    value.to_s.strip
  end

  def self.fetch_fallout_channel_member_ids
    Rails.cache.fetch("soup_campaigns/fallout_channel_members", expires_in: 5.minutes) do
      client = Slack::Web::Client.new(token: ENV.fetch("SLACK_BOT_TOKEN", nil))
      members = []
      cursor = nil

      loop do
        response = client.conversations_members(channel: FALLOUT_CHANNEL_ID, limit: 200, cursor: cursor)
        members.concat(response.members)
        cursor = response.response_metadata&.next_cursor
        break if cursor.blank?
      end

      members
    end
  rescue Slack::Web::Api::Errors::SlackError => e
    Rails.logger.tagged("SoupCampaign") do
      Rails.logger.error({ event: "channel_members_fetch_failed", error: e.message }.to_json)
    end
    []
  end

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

  def targeted?
    targeting_supported? && self[:target_query].present?
  end

  def target_user_ids_text
    return "" unless targeting_supported?

    self[:target_query].to_s
  end

  def target_user_ids_text=(value)
    return unless targeting_supported?

    self.target_query = self.class.parse_target_query(value)
    self.target_user_ids = resolve_target_user_ids(target_query)
  end

  def projected_recipients
    recipients = {}

    if targeted?
      target_users.find_each do |user|
        recipients[user.slack_id] ||= { user_id: user.id, slack_id: user.slack_id, display_name: user.display_name }
      end
    else
      User.verified.kept.where.not(slack_id: nil).find_each do |user|
        recipients[user.slack_id] ||= { user_id: user.id, slack_id: user.slack_id, display_name: user.display_name }
      end

      self.class.fetch_fallout_channel_member_ids.each do |slack_id|
        recipients[slack_id] ||= { user_id: nil, slack_id: slack_id, display_name: nil }
      end
    end

    recipients
      .reject { |slack_id, _| BLOCKLIST.include?(slack_id) }
      .values
      .sort_by { |recipient| [ recipient[:display_name].presence&.downcase || "zzzzzz", recipient[:slack_id] ] }
  end

  private

  def targeting_supported?
    self.class.column_names.include?("target_query") && self.class.column_names.include?("target_user_ids")
  end

  def target_users
    return User.none unless targeting_supported?

    User.verified.kept.where(id: target_user_ids).where.not(slack_id: nil)
  end

  def normalize_target_user_ids
    return unless targeting_supported?

    self.target_user_ids = Array(target_user_ids).filter_map { |id| Integer(id, exception: false) }.select(&:positive?).uniq
  end

  def resolve_target_user_ids(query)
    return [] unless targeting_supported?
    return [] if query.blank?

    scope = User.verified.kept
    filters = query.lines.map(&:strip).reject(&:blank?)

    filters.each do |filter|
      scope = apply_target_filter(scope, filter)
    end

    scope.distinct.pluck(:id)
  rescue ArgumentError => e
    errors.add(:target_user_ids_text, e.message)
    []
  end

  def apply_target_filter(scope, filter)
    case filter
    when /\Aids:\s*(.+)\z/i
      ids = Regexp.last_match(1).scan(/\d+/).filter_map { |id| Integer(id, exception: false) }.select(&:positive?).uniq
      raise ArgumentError, "ids: must include at least one user id" if ids.empty?

      scope.where(id: ids)
    when /\Ahas_ships:\s*(true|false)\z/i
      Regexp.last_match(1).downcase == "true" ? scope.joins(projects: :ships) : scope.where.not(id: User.joins(projects: :ships).select(:id))
    when /\Aqualified:\s*(true|false)\z/i
      filter_by_ticket_qualification(scope, Regexp.last_match(1).downcase == "true")
    when /\Atotal_time_logged_seconds\s*(>=|<=|=|>|<)\s*(\d+)\z/i
      operator = Regexp.last_match(1)
      threshold = Regexp.last_match(2).to_i
      filter_by_total_time(scope, operator, threshold)
    else
      raise ArgumentError, "unsupported audience filter: #{filter}"
    end
  end

  def filter_by_total_time(scope, operator, threshold)
    matching_ids = []

    scope.find_in_batches(batch_size: HOURS_BATCH_SIZE) do |users|
      users.each do |user|
        matching_ids << user.id if user.total_time_logged_seconds.public_send(operator, threshold)
      end
    end

    scope.where(id: matching_ids)
  end

  def filter_by_ticket_qualification(scope, qualified)
    approved_claims = User.joins(:ticket_claim).merge(TicketClaim.approved).select(:id)

    qualified ? scope.where(id: approved_claims) : scope.where.not(id: approved_claims)
  end

  def generate_unsubscribe_token
    self.unsubscribe_token ||= SecureRandom.urlsafe_base64(24)
  end
end
