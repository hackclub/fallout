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

  # status_counts: optional precomputed `group(:status).count` hash (integer-keyed) so callers
  # rendering many campaigns can batch the per-status counts into one query. nil = self-query.
  def recipient_stats(status_counts = nil)
    totals = (status_counts || soup_campaign_recipients.group(:status).count)
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

  def progress_percent(status_counts = nil)
    total = soup_campaign_recipients_count
    return 0 if total.zero?

    done = if status_counts
      status_counts
        .transform_keys { |k| SoupCampaignRecipient.statuses.key(k) }
        .values_at("sent", "failed", "skipped", "unsubscribed").map(&:to_i).sum
    else
      soup_campaign_recipients.where(status: %i[sent failed skipped unsubscribed]).count
    end
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

    base = User.verified.kept
    mode, filters = extract_match_mode(query.lines.map(&:strip).reject(&:blank?))
    return [] if filters.empty?

    if mode == :any
      # OR: union each filter's matches, computed independently against the full base scope.
      filters.flat_map { |filter| apply_target_filter(base, filter).distinct.pluck(:id) }.uniq
    else
      # AND: chain filters so each narrows the previous scope.
      filters.reduce(base) { |scope, filter| apply_target_filter(scope, filter) }.distinct.pluck(:id)
    end
  rescue ArgumentError => e
    errors.add(:target_user_ids_text, e.message)
    []
  end

  # Pulls an optional `match: all|any` directive out of the filter lines. Defaults to :all
  # (every filter must match); :any unions the filters so a user matching any one is included.
  def extract_match_mode(lines)
    mode = :all
    filters = lines.reject do |line|
      next false unless (m = line.match(/\Amatch:\s*(all|any)\z/i))

      mode = m[1].downcase.to_sym
      true
    end
    [ mode, filters ]
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
    when /\Atotal_time_(logged|submitted)_seconds\s*(>=|<=|=|>|<)\s*(\d+)\z/i
      metric = Regexp.last_match(1).downcase
      operator = Regexp.last_match(2)
      threshold = Regexp.last_match(3).to_i
      filter_by_total_time(scope, operator, threshold, shipped_only: metric == "submitted")
    else
      raise ArgumentError, "unsupported audience filter: #{filter}"
    end
  end

  # shipped_only restricts to logged time the user has actually submitted (attached to a ship,
  # any status), matching User#shipped_time_logged_seconds. Default counts all logged time.
  def filter_by_total_time(scope, operator, threshold, shipped_only: false)
    user_ids = scope.pluck(:id)
    return scope.none if user_ids.empty?

    seconds_by_user = compute_batch_user_seconds(user_ids, shipped_only: shipped_only)
    # Iterate the full id list (not just hash keys) so users with zero attributed seconds
    # still match <, <= and = 0 — they're absent from the totals hash otherwise.
    matching_ids = user_ids.select { |uid| seconds_by_user[uid].to_i.public_send(operator, threshold) }
    scope.where(id: matching_ids)
  end

  def compute_batch_user_seconds(user_ids, shipped_only: false)
    user_set = user_ids.to_set
    totals = Hash.new(0)

    owned_pids = Project.kept.where(user_id: user_ids).pluck(:id)

    collab_pids = Collaborator.kept
      .where(user_id: user_ids, collaboratable_type: "Project")
      .joins("INNER JOIN projects ON projects.id = collaborators.collaboratable_id AND projects.discarded_at IS NULL")
      .pluck(:collaboratable_id)

    je_author_pids = JournalEntry.kept.where(user_id: user_ids).distinct.pluck(:project_id)

    je_collab_je_ids = Collaborator.kept
      .where(user_id: user_ids, collaboratable_type: "JournalEntry")
      .pluck(:collaboratable_id)

    je_collab_pids = if je_collab_je_ids.any?
      JournalEntry.kept.where(id: je_collab_je_ids).distinct.pluck(:project_id)
    else
      []
    end

    all_project_ids = (owned_pids + collab_pids + je_author_pids + je_collab_pids).uniq
    return totals if all_project_ids.empty?

    je_scope = JournalEntry.kept.where(project_id: all_project_ids)
    je_scope = je_scope.where.not(ship_id: nil) if shipped_only # submitted == attached to a ship
    all_je_ids = je_scope.pluck(:id)
    return totals if all_je_ids.empty?

    je_seconds = JournalEntry.batch_time_logged(all_je_ids)
    je_attributions = JournalEntry.batch_attributed_user_ids(all_je_ids)
    je_authors = JournalEntry.where(id: all_je_ids).pluck(:id, :user_id).to_h

    je_seconds.each do |je_id, total_secs|
      author_id = je_authors[je_id]
      next unless author_id
      attr_set = ([ author_id ] | (je_attributions[je_id] || [])).uniq
      next if attr_set.empty?
      share = total_secs / attr_set.size
      attr_set.each { |uid| totals[uid] += share if user_set.include?(uid) }
    end

    # manual_seconds is project-level, not attached to a ship — exclude it from submitted totals.
    unless shipped_only
      project_members = Hash.new { |h, k| h[k] = [] }
      Project.kept.where(id: all_project_ids, user_id: user_ids)
        .pluck(:id, :user_id).each { |pid, uid| project_members[pid] << uid }
      Collaborator.kept
        .where(user_id: user_ids, collaboratable_type: "Project", collaboratable_id: all_project_ids)
        .pluck(:collaboratable_id, :user_id)
        .each { |pid, uid| project_members[pid] << uid }

      member_counts = Project.batch_member_counts(all_project_ids)
      Project.kept.where(id: all_project_ids).where("manual_seconds > 0")
        .pluck(:id, :manual_seconds).each do |pid, manual|
        mc = member_counts[pid].to_i
        next unless mc.positive?
        project_members[pid].each { |uid| totals[uid] += manual / mc }
      end
    end

    totals
  end

  def filter_by_ticket_qualification(scope, qualified)
    approved_claims = User.joins(:ticket_claim).merge(TicketClaim.approved).select(:id)

    qualified ? scope.where(id: approved_claims) : scope.where.not(id: approved_claims)
  end

  def generate_unsubscribe_token
    self.unsubscribe_token ||= SecureRandom.urlsafe_base64(24)
  end
end
