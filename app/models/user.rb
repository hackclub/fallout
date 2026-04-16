# == Schema Information
#
# Table name: users
#
#  id                          :bigint           not null, primary key
#  avatar                      :string           not null
#  device_token                :text
#  discarded_at                :datetime
#  display_name                :string           not null
#  email                       :string           not null
#  hca_token                   :text
#  is_adult                    :boolean          default(FALSE), not null
#  is_banned                   :boolean          default(FALSE), not null
#  lapse_token                 :text
#  onboarded                   :boolean          default(FALSE), not null
#  pending_lookout_tokens      :string           default([]), not null, is an Array
#  roles                       :string           default([]), not null, is an Array
#  streak_freezes              :integer          default(1), not null
#  streak_in_app_notifications :boolean          default(TRUE), not null
#  streak_slack_notifications  :boolean          default(TRUE), not null
#  timezone                    :string           not null
#  type                        :string
#  verification_status         :string
#  created_at                  :datetime         not null
#  updated_at                  :datetime         not null
#  hca_id                      :string
#  slack_id                    :string
#
# Indexes
#
#  index_users_on_device_token        (device_token)
#  index_users_on_discarded_at        (discarded_at)
#  index_users_on_hca_id              (hca_id) UNIQUE WHERE (hca_id IS NOT NULL)
#  index_users_unique_verified_email  (email) UNIQUE WHERE ((type IS NULL) AND (discarded_at IS NULL))
#
class User < ApplicationRecord
  include Discardable
  include PgSearch::Model
  include Flipper::Identifier # Enables per-user feature flags via Flipper

  has_paper_trail

  pg_search_scope :search, against: [ :display_name, :email ], using: { tsearch: { prefix: true } }

  scoped_search on: :id
  scoped_search on: :display_name, aliases: [ :name, :username ]
  scoped_search on: :email
  scoped_search on: :slack_id
  scoped_search on: :created_at, aliases: [ :joined ]
  scoped_search on: :roles, aliases: [ :role ], ext_method: :search_roles, only_explicit: true, operators: [ :eq, :ne ]

  def self.search_roles(_key, operator, value)
    sanitized = ActiveRecord::Base.sanitize_sql_like(value)
    sql = if operator == "="
      "roles @> ARRAY['#{sanitized}']::varchar[]"
    else
      "NOT (roles @> ARRAY['#{sanitized}']::varchar[])"
    end
    { conditions: sql }
  end

  has_many :ahoy_visits, class_name: "Ahoy::Visit", dependent: :nullify
  has_many :ahoy_events, class_name: "Ahoy::Event", dependent: :nullify
  has_one :latest_locatable_visit, -> { where.not(country: [ nil, "" ]).order(started_at: :desc) }, class_name: "Ahoy::Visit"
  has_many :projects, dependent: :destroy
  has_many :ships, through: :projects
  has_many :reviewed_ships, class_name: "Ship", foreign_key: :reviewer_id, dependent: :nullify, inverse_of: :reviewer
  has_many :onboarding_responses, dependent: :destroy
  has_many :journal_entries, dependent: :destroy
  has_many :lapse_timelapses, dependent: :destroy
  has_many :lookout_timelapses, dependent: :destroy
  has_many :mail_messages, dependent: :destroy
  has_many :authored_mail_messages, class_name: "MailMessage", foreign_key: :author_id, dependent: :nullify, inverse_of: :author
  has_many :mail_interactions, dependent: :destroy
  has_many :critters, dependent: :destroy
  has_many :koi_transactions, dependent: :destroy
  has_many :acting_koi_transactions, class_name: "KoiTransaction", foreign_key: :actor_id, dependent: :nullify, inverse_of: :actor
  has_many :gold_transactions, dependent: :destroy
  has_many :acting_gold_transactions, class_name: "GoldTransaction", foreign_key: :actor_id, dependent: :nullify, inverse_of: :actor
  has_many :shop_orders, dependent: :destroy
  has_many :streak_days, dependent: :destroy
  has_many :streak_events, dependent: :destroy
  has_one :streak_goal, dependent: :destroy
  has_many :collaborations, -> { kept }, class_name: "Collaborator", dependent: :destroy
  has_many :collaborated_projects, through: :collaborations, source: :collaboratable, source_type: "Project"
  has_many :received_collaboration_invites, -> { kept }, class_name: "CollaborationInvite", foreign_key: :invitee_id, dependent: :destroy, inverse_of: :invitee
  has_many :sent_collaboration_invites, -> { kept }, class_name: "CollaborationInvite", foreign_key: :inviter_id, dependent: :destroy, inverse_of: :inviter
  has_many :sent_pending_collaboration_invites, -> { kept }, class_name: "PendingCollaborationInvite", foreign_key: :inviter_id, dependent: :destroy, inverse_of: :inviter
  has_many :dialog_campaigns, dependent: :destroy
  has_many :hcb_grant_cards, dependent: :destroy
  has_one :active_hcb_grant_card, -> { where(status: "active") }, class_name: "HcbGrantCard"
  has_many :reviewer_notes
  has_many :project_flags

  encrypts :hca_token
  encrypts :lapse_token
  encrypts :device_token, deterministic: true # Deterministic so find_by lookups work

  scope :verified, -> { where(type: nil) } # STI: verified users have type=nil; TrialUser subclass has type='TrialUser'

  validates :avatar, :display_name, :email, :timezone, presence: true
  validates :slack_id, presence: true, unless: :trial?
  validates :hca_id, presence: true, unless: :trial?
  VALID_ROLES = %w[user admin time_auditor requirements_checker pass2_reviewer].freeze
  REVIEWER_ROLES = %w[time_auditor requirements_checker pass2_reviewer].freeze
  SLACK_WELCOME_CHANNELS = %w[C037157AL30 C0ACG0XQWGN C0ACJ290090].freeze

  validates :roles, presence: true, unless: :trial?
  validate :roles_must_be_valid, unless: :trial?
  validates :is_banned, inclusion: { in: [ true, false ] }

  def has_role?(role)
    roles.include?(role.to_s)
  end

  def add_role(role)
    raise ArgumentError, "Invalid role: #{role}" unless role.to_s.in?(VALID_ROLES)

    roles << role.to_s unless has_role?(role)
    save
  end

  def remove_role(role)
    roles.delete(role.to_s)
    save
  end

  def admin?
    has_role?(:admin)
  end

  def user?
    has_role?(:user)
  end

  def reviewer?
    (roles & REVIEWER_ROLES).any?
  end

  def time_auditor?
    has_role?(:time_auditor)
  end

  def requirements_checker?
    has_role?(:requirements_checker)
  end

  def pass2_reviewer?
    has_role?(:pass2_reviewer)
  end

  # True if user can review in a specific queue
  def can_review?(queue)
    return true if admin?
    case queue.to_s
    when "time_audit" then time_auditor?
    when "requirements_check" then requirements_checker? || pass2_reviewer?
    when "design_review", "build_review" then pass2_reviewer?
    else false
    end
  end

  def staff?
    admin? || reviewer?
  end

  def trial?
    false
  end

  def verified?
    true
  end

  def self.exchange_hca_token(code, redirect_uri)
    token_data = HcaService.exchange_code_for_token(code, redirect_uri)

    unless token_data
      raise StandardError, "Failed to exchange authorization code for HCA access token"
    end

    access_token = token_data["access_token"]
    unless access_token
      raise StandardError, "No access token in HCA response"
    end

    hca_response = HcaService.me(access_token)
    unless hca_response
      raise StandardError, "Failed to fetch user identity from HCA"
    end

    identity = hca_response["identity"]
    unless identity
      raise StandardError, "No identity data in HCA response"
    end

    hca_id = identity["id"]
    email = identity["primary_email"]
    user = User.find_by(hca_id: hca_id)

    if user.present?
      Rails.logger.tagged("UserCreation") do
        Rails.logger.info({
          event: "existing_user_found",
          hca_id: hca_id,
          user_id: user.id
        }.to_json)
      end

      user.update(hca_token: access_token, email: email)
      user.refresh_profile_from_slack
      return user
    end

    user = create_from_hca(identity, access_token)
    user.refresh_profile_from_slack
    user
  end

  def self.create_from_hca(identity, access_token)
    email = identity["primary_email"]
    first_name = identity["first_name"] || ""
    display_name = first_name.presence || identity["id"] || "User"
    avatar = identity["profile_picture"].presence || "/static-assets/pfp_fallback.webp"
    timezone = "UTC"
    slack_id = identity["slack_id"] || ""
    verification_status = identity["verification_status"] || ""
    is_adult = determine_is_adult(identity)

    if email.blank? || !(email =~ URI::MailTo::EMAIL_REGEXP)
      ErrorReporter.capture_message("HCA user missing or invalid email", level: :warning, contexts: {
        user_creation: { email: email, hca_id: identity["id"] }
      })
      raise StandardError, "HCA user has an invalid email: #{email.inspect}"
    end

    Rails.logger.tagged("UserCreation") do
      Rails.logger.info({
        event: "hca_user_found",
        email: email,
        display_name: display_name,
        slack_id: slack_id,
        is_adult: is_adult
      }.to_json)
    end

    User.create!(
      email: email,
      display_name: display_name,
      avatar: avatar,
      timezone: timezone,
      slack_id: slack_id,
      verification_status: verification_status,
      hca_token: access_token,
      hca_id: identity["id"],
      is_adult: is_adult,
      is_banned: false,
      roles: [ "user" ]
    )
  end

  def refresh_profile_from_slack
    return if slack_id.blank?

    user_info = User.fetch_slack_user_info(normalized_slack_id)
    return unless user_info

    profile = user_info.user.profile
    return unless profile

    new_display_name = profile.display_name.presence
    new_avatar = profile.image_192.presence ||
      profile.image_512.presence ||
      profile.image_72.presence ||
      profile.image_48.presence ||
      profile.image_32.presence ||
      profile.image_24.presence ||
      profile.image_original

    updates = {}
    updates[:display_name] = new_display_name if new_display_name.present? && display_name != new_display_name
    if new_avatar.present? && avatar != new_avatar
      updates[:avatar] = new_avatar
    elsif avatar.blank?
      updates[:avatar] = "/static-assets/pfp_fallback.webp"
    end

    return if updates.empty?

    Rails.logger.tagged("ProfileRefresh") do
      Rails.logger.info({
        event: "slack_profile_refresh",
        user_id: id,
        slack_id: slack_id,
        updates: updates.keys
      }.to_json)
    end

    update!(updates)
  rescue StandardError => e
    ErrorReporter.capture_exception(e, contexts: {
      profile_refresh: { user_id: id, slack_id: slack_id }
    })
  end

  def first_ref
    first_visit = ahoy_visits.order(:started_at).first
    return nil unless first_visit

    visitor_token = first_visit.visitor_token
    earliest_visit_with_ref = Ahoy::Visit.where(visitor_token: visitor_token)
                                          .where.not(utm_source: nil)
                                          .order(:started_at)
                                          .first

    earliest_visit_with_ref&.utm_source
  end

  def total_time_logged_seconds
    entry_scope = { project_id: projects.kept.select(:id), discarded_at: nil }

    LapseTimelapse.joins(recording: :journal_entry).where(journal_entries: entry_scope).sum(:duration).to_i +
      YouTubeVideo.joins(recording: :journal_entry).where(journal_entries: entry_scope).sum(:duration_seconds).to_i +
      LookoutTimelapse.joins(recording: :journal_entry).where(journal_entries: entry_scope).sum(:duration).to_i
  end

  def koi
    return 0 if trial? # Trial users cannot earn or spend koi

    koi_transactions.sum(:amount) -
      shop_orders.joins(:shop_item).where(shop_items: { currency: "koi" }).where.not(state: :rejected).sum("frozen_price * quantity")
  end

  def gold
    return 0 if trial? # Trial users cannot earn or spend gold

    gold_transactions.sum(:amount) -
      shop_orders.joins(:shop_item).where(shop_items: { currency: "gold" }).where.not(state: :rejected).sum("frozen_price * quantity")
  end

  def self.normalize_country_code(country)
    return nil if country.blank?
    return country if country.length == 2

    ISO3166::Country.find_all_by(:unofficial_names, country).keys.first
  end

  def self.airtable_sync_table_id
    "tblxIZLHdihXkmW86"
  end

  def self.airtable_sync_sync_id
    "M1Rx186e"
  end

  def self.airtable_sync_scope(query)
    query.includes(:latest_locatable_visit)
  end

  def self.airtable_sync_preload(records)
    user_ids = records.map(&:id)
    {
      first_project_created_at: Project.kept.where(user_id: user_ids).group(:user_id).minimum(:created_at)
    }
  end

  def self.airtable_sync_field_mappings
    {
      "ID" => :id,
      "Email" => :email,
      "Display Name" => :display_name,
      "First Name" => ->(u) { u.hca_identity&.dig("first_name") },
      "Last Name" => ->(u) { u.hca_identity&.dig("last_name") },
      "Country" => ->(u) {
        raw = u.hca_identity&.dig("addresses")&.find { |a| a["primary"] }&.dig("country") ||
              u.latest_locatable_visit&.country
        User.normalize_country_code(raw)
      },
      "First Project Created At" => ->(u, pre) { pre[:first_project_created_at][u.id]&.iso8601 },
      "Created At" => ->(u) { u.created_at&.iso8601 },
      "Email Verified" => ->(u) { !u.trial? }
    }
  end

  def can_earn_critter?
    !trial?
  end

  def needs_onboarding?
    !onboarded?
  end

  def reset_onboarding!
    onboarding_responses.destroy_all
    update!(onboarded: false)
  end

  def get_timelapses
    if lapse_token.present?
      begin
        return LapseService.my_published_timelapses(lapse_token) || []
      rescue LapseService::Unauthorized
        update!(lapse_token: nil)
      end
    end

    get_timelapses_via_program_key
  end

  def hca_identity
    return nil if hca_token.blank?

    @hca_identity ||= HcaService.me(hca_token)&.dig("identity")
  end

  def preferred_reminder_hour
    tz = ActiveSupport::TimeZone[timezone] || ActiveSupport::TimeZone["UTC"]
    quoted_tz = self.class.connection.quote(tz.tzinfo.identifier)

    # Single query: earliest journal entry per day → extract hour, all in user's local timezone
    hours = journal_entries.kept
      .select(Arel.sql("EXTRACT(HOUR FROM MIN(created_at AT TIME ZONE 'UTC' AT TIME ZONE #{quoted_tz}))::int AS hour"))
      .group(Arel.sql("(created_at AT TIME ZONE 'UTC' AT TIME ZONE #{quoted_tz})::date"))
      .map(&:hour)

    return 18 if hours.empty?

    hours.sort!
    median_hour = hours[hours.size / 2]

    entry_ids = journal_entries.kept.select(:id)
    total_seconds = LapseTimelapse.joins(:recording).where(recordings: { journal_entry_id: entry_ids }).sum(:duration).to_i +
                    YouTubeVideo.joins(:recording).where(recordings: { journal_entry_id: entry_ids }).sum(:duration_seconds).to_i +
                    LookoutTimelapse.joins(:recording).where(recordings: { journal_entry_id: entry_ids }).sum(:duration).to_i
    avg_duration_hours = (total_seconds.to_f / hours.size / 3600).ceil

    (median_hour - avg_duration_hours).clamp(6, 22)
  end

  private

  def get_timelapses_via_program_key
    return [] if trial? # Trial users have unverified emails — don't look up Lapse by email

    lapse_user = LapseService.query_user_by_email(email)
    return [] unless lapse_user&.dig("id")

    LapseService.find_timelapses_by_user(lapse_user["id"]) || []
  rescue StandardError => e
    ErrorReporter.capture_exception(e, contexts: { lapse: { user_id: id, action: "program_key_fallback" } })
    []
  end

  def roles_must_be_valid
    return if roles.blank?

    invalid = roles - VALID_ROLES
    errors.add(:roles, "contain invalid values: #{invalid.join(', ')}") if invalid.any?
  end

  def self.determine_is_adult(identity)
    birthday_str = identity["birthday"]
    return false if birthday_str.blank?

    begin
      birthday = Date.parse(birthday_str)
      age_today = (Date.today - birthday.to_date) / 365.25
      age_today >= 19
    rescue ArgumentError
      false
    end
  end

  def self.fetch_slack_user_info(slack_id)
    return nil if slack_id.blank?

    client = Slack::Web::Client.new(token: ENV.fetch("SLACK_BOT_TOKEN", nil))
    retries = 0

    begin
      client.users_info(user: slack_id)
    rescue Slack::Web::Api::Errors::TooManyRequestsError => e
      if retries < 3
        sleep e.retry_after
        retries += 1
        retry
      end

      ErrorReporter.capture_exception(e, contexts: { slack: { slack_id: slack_id, retries: retries } })
      nil
    rescue Slack::Web::Api::Errors::SlackError => e
      ErrorReporter.capture_exception(e, level: :warning, contexts: { slack: { slack_id: slack_id } })
      nil
    rescue StandardError => e
      ErrorReporter.capture_exception(e, level: :warning, contexts: { slack: { slack_id: slack_id } })
      nil
    end
  end

  def normalized_slack_id
    return slack_id unless Rails.env.development?

    slack_id.delete_suffix("_DEV")
  end
end
