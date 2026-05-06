# == Schema Information
#
# Table name: mail_messages
#
#  id           :bigint           not null, primary key
#  action_label :string
#  action_url   :string
#  auto_open    :boolean
#  content      :text
#  dismissable  :boolean          default(TRUE), not null
#  expires_at   :datetime
#  filters      :jsonb            not null
#  pinned       :boolean          default(FALSE), not null
#  source_type  :string
#  summary      :string           not null
#  created_at   :datetime         not null
#  updated_at   :datetime         not null
#  author_id    :bigint
#  source_id    :bigint
#  user_id      :bigint
#
# Indexes
#
#  index_mail_messages_on_expires_at                 (expires_at)
#  index_mail_messages_on_filters                    (filters) USING gin
#  index_mail_messages_on_source_type_and_source_id  (source_type,source_id)
#  index_mail_messages_on_user_id                    (user_id)
#
# Foreign Keys
#
#  fk_rails_...  (author_id => users.id)
#  fk_rails_...  (user_id => users.id)
#
class MailMessage < ApplicationRecord
  has_paper_trail

  belongs_to :user, optional: true
  belongs_to :author, class_name: "User", optional: true
  belongs_to :source, polymorphic: true, optional: true

  has_many :mail_interactions, dependent: :destroy

  validates :summary, presence: true

  scope :not_expired, -> { where("mail_messages.expires_at IS NULL OR mail_messages.expires_at > ?", Time.current) }
  scope :pinned, -> { where(pinned: true) }

  scope :visible_to, ->(user) {
    not_expired
      .where(build_visibility_condition(user))
      .where.not(id: user.mail_interactions.dismissed.select(:mail_message_id))
  }

  def self.build_visibility_condition(user)
    direct = arel_table[:user_id].eq(user.id)

    broadcast = arel_table[:user_id].eq(nil).and(
      Arel::Nodes::SqlLiteral.new("mail_messages.filters = '{}'::jsonb")
    )

    filtered = arel_table[:user_id].eq(nil).and(
      Arel::Nodes::SqlLiteral.new("mail_messages.filters != '{}'::jsonb")
    ).and(Arel::Nodes::SqlLiteral.new(build_filter_conditions(user)))

    direct.or(broadcast).or(filtered)
  end

  def self.build_filter_conditions(user)
    conditions = []
    binds = []

    # Role filter: user has any of the specified roles
    if user.roles.present?
      conditions << "(mail_messages.filters->'roles' IS NULL OR jsonb_exists_any(mail_messages.filters->'roles', ARRAY[#{user.roles.map { '?' }.join(',')}]))"
      binds.concat(user.roles)
    else
      conditions << "mail_messages.filters->'roles' IS NULL"
    end

    # Join date filters
    user_date = user.created_at.to_date.iso8601
    conditions << "(mail_messages.filters->>'joined_before' IS NULL OR ? < (mail_messages.filters->>'joined_before')::date)"
    binds << user_date
    conditions << "(mail_messages.filters->>'joined_after' IS NULL OR ? >= (mail_messages.filters->>'joined_after')::date)"
    binds << user_date

    # Activity filters — pre-evaluated in Ruby, safe boolean/string values only
    has_projects = user.projects.kept.exists?
    conditions << "(mail_messages.filters->>'has_projects' IS NULL OR #{has_projects})" # Safe: Ruby boolean literal, not user input

    is_full_user = !user.trial? # Safe: Ruby boolean literal, not user input
    conditions << "(mail_messages.filters->>'full_users_only' IS NULL OR #{is_full_user})"

    ship_statuses = user.ships.distinct.pluck(:status)
    if ship_statuses.any?
      conditions << "(mail_messages.filters->>'has_ships_with_status' IS NULL OR mail_messages.filters->>'has_ships_with_status' IN (#{ship_statuses.map { '?' }.join(',')}))"
      binds.concat(ship_statuses)
    else
      conditions << "(mail_messages.filters->>'has_ships_with_status' IS NULL OR FALSE)"
    end

    # Explicit user ID list
    conditions << "(mail_messages.filters->'user_ids' IS NULL OR mail_messages.filters->'user_ids' @> ?::jsonb)"
    binds << user.id.to_s

    sanitize_sql_array([ conditions.join(" AND "), *binds ])
  end
end
