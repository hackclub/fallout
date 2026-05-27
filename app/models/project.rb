# == Schema Information
#
# Table name: projects
#
#  id                           :bigint           not null, primary key
#  built_irl                    :boolean          default(FALSE), not null
#  demo_link                    :string
#  demo_video_link              :string
#  description                  :text
#  discarded_at                 :datetime
#  inactivity_dm_sent_at        :datetime
#  is_unlisted                  :boolean          default(FALSE), not null
#  manual_seconds               :integer          default(0), not null
#  name                         :string           not null
#  repo_link                    :string
#  tags                         :string           default([]), not null, is an Array
#  unified_thumbnail_checked_at :datetime
#  unified_thumbnail_etag       :string
#  unified_thumbnail_source_url :string
#  created_at                   :datetime         not null
#  updated_at                   :datetime         not null
#  user_id                      :bigint           not null
#
# Indexes
#
#  index_projects_on_discarded_at                  (discarded_at)
#  index_projects_on_is_unlisted                   (is_unlisted)
#  index_projects_on_name_trgm                     (name) USING gin
#  index_projects_on_tags                          (tags) USING gin
#  index_projects_on_unified_thumbnail_checked_at  (unified_thumbnail_checked_at)
#  index_projects_on_user_id                       (user_id)
#
# Foreign Keys
#
#  fk_rails_...  (user_id => users.id)
#
class Project < ApplicationRecord
  include Discardable
  include PgSearch::Model
  include MeiliSearch::Rails
  include Broadcastable

  has_paper_trail

  # Live-update the owner's path page so the has_projects flag flips on create / discard.
  # Collaborator fan-out happens via the Collaborator model's own broadcast.
  broadcasts_updates_to { "path_user_#{user_id}" }
  # Dirty-only public stats refresh; payload intentionally omits project IDs.
  after_commit :broadcast_bulletin_explore_update
  after_commit :enqueue_meilisearch_reindex
  after_commit :enqueue_unified_thumbnail_compute_if_repo_changed

  pg_search_scope :search, against: [ :name, :description ], using: { tsearch: { prefix: true } }

  meilisearch auto_index: false, auto_remove: false do
    attribute :name, :description, :tags
    attribute :created_at do
      created_at.to_i
    end
    attribute :journal_count do
      kept_journal_entries.count
    end
    attribute :owner_name do
      user.display_name
    end
    attribute :collaborator_names do
      collaborator_users.map(&:display_name)
    end
    searchable_attributes %w[name description tags owner_name collaborator_names]
    ranking_rules %w[words typo proximity attribute sort exactness]
    sortable_attributes %w[journal_count created_at]
    filterable_attributes %w[is_unlisted]
  end

  scoped_search on: :id
  scoped_search on: :name
  scoped_search on: :description
  scoped_search on: :repo_link
  scoped_search on: :is_unlisted, aliases: [ :unlisted ], default_operator: :exact_match
  scoped_search on: :created_at
  scoped_search relation: :user, on: :display_name, rename: :owner

  belongs_to :user
  has_many :ships, dependent: :destroy
  has_many :preflight_runs, dependent: :destroy
  has_many :journal_entries, dependent: :destroy
  has_many :kept_journal_entries, -> { kept }, class_name: "JournalEntry"
  has_many :collaborators, -> { kept }, as: :collaboratable, dependent: :destroy
  has_many :collaborator_users, through: :collaborators, source: :user
  has_many :collaboration_invites, -> { kept }, dependent: :destroy
  has_many :pending_collaboration_invites, -> { kept }, dependent: :destroy
  has_many :reviewer_notes, dependent: :destroy
  has_many :project_flags, dependent: :destroy

  # Cached, pre-rasterized zine/poster image used as the project's cover on the
  # bulletin board explore feed and the public /api/v1/explore API. Populated
  # by ComputeProjectUnifiedThumbnailJob (zine source URL discovered via
  # ShipChecks::UnifiedScreenshotFinder, then transcoded to JPEG via
  # ShipChecks::UnifiedScreenshotProcessor which also handles PDF rasterization).
  has_one_attached :unified_thumbnail

  def discard
    transaction do
      Collaborator.where(collaboratable: self).each(&:discard)
      CollaborationInvite.where(project: self).each(&:discard)
      journal_entries.each(&:discard)
      super
    end
  end

  def collaborator?(user)
    return false unless user
    collaborator_users.include?(user)
  end

  def owner_or_collaborator?(user)
    return false unless user
    user_id == user.id || collaborator?(user)
  end

  def flagged?
    project_flags.exists?
  end

  validates :name, presence: true
  validates :is_unlisted, inclusion: { in: [ true, false ] }
  validates :demo_link, format: { with: /\Ahttps?:\/\/\S+\z/i, message: "must be a valid URL starting with http:// or https://" }, allow_blank: true
  validates :repo_link, format: { with: /\Ahttps?:\/\/\S+\z/i, message: "must be a valid URL starting with http:// or https://" }, allow_blank: true
  validates :demo_video_link, format: { with: /\Ahttps?:\/\/\S+\z/i, message: "must be a valid URL starting with http:// or https://" }, allow_blank: true
  validate :demo_video_link_required_when_built_irl

  scope :listed, -> { where(is_unlisted: false) }
  scope :public_for_explore, -> { kept.listed }

  def self.airtable_sync_table_id
    "tblrwWzDwN6V4avNP"
  end

  def self.airtable_sync_sync_id
    "I36OalE9"
  end

  def self.airtable_sync_preload(records)
    project_ids = records.map(&:id)

    hours_logged = batch_time_logged(project_ids).transform_values { |s| s.to_f / 3600.0 }

    { hours_logged: hours_logged }
  end

  def self.airtable_sync_field_mappings
    {
      "ID" => :id,
      "Name" => :name,
      "Description" => :description,
      "Repo Link" => :repo_link,
      "Created At" => ->(p) { p.created_at&.iso8601 },
      "Deleted At" => ->(p) { p.discarded_at&.iso8601 },
      "Author" => ->(p) { p.user&.id },
      "Hours Logged" => ->(p, pre) { (pre[:hours_logged][p.id] || 0).round(2) }
    }
  end

  # User-declared on the project edit page. Drives ship_type at submission time
  # (true → build review queue, false → design review queue) and is the trigger
  # condition for BuiltIrlConversionService (koi → gold sweep) on the first
  # build-ship approval. The boolean predicate `built_irl?` is auto-generated by
  # ActiveRecord from the column.

  # Lifetime koi awarded to this project across all approved DR cycles, including
  # DR koi_adjustment (which is baked into ship_review amounts). Used as the cap for
  # how much koi can convert to gold when this project becomes built_irl.
  def lifetime_ship_review_koi
    KoiTransaction.where(reason: "ship_review", ship_id: ships.select(:id)).sum(:amount)
  end

  def time_logged
    lapse = LapseTimelapse
      .joins(recording: :journal_entry)
      .where(journal_entries: { project_id: id, discarded_at: nil })
      .sum(:duration).to_i

    youtube = YouTubeVideo
      .joins(recording: :journal_entry)
      .where(journal_entries: { project_id: id, discarded_at: nil })
      .sum(Arel.sql("duration_seconds * stretch_multiplier")).to_i

    lookout = LookoutTimelapse
      .joins(recording: :journal_entry)
      .where(journal_entries: { project_id: id, discarded_at: nil })
      .sum(:duration).to_i

    lapse + youtube + lookout + manual_seconds.to_i
  end

  def self.batch_member_counts(project_ids)
    return {} if project_ids.empty?
    kept_owner_ids = joins("INNER JOIN users ON users.id = projects.user_id AND users.discarded_at IS NULL AND users.type IS NULL")
      .where(id: project_ids).pluck(:id).to_set
    collab_counts = Collaborator.kept
      .joins("INNER JOIN users ON users.id = collaborators.user_id AND users.discarded_at IS NULL AND users.type IS NULL")
      .where(collaboratable_type: "Project", collaboratable_id: project_ids)
      .group(:collaboratable_id).count
    project_ids.to_h { |pid| [ pid, (kept_owner_ids.include?(pid) ? 1 : 0) + (collab_counts[pid] || 0) ] }
  end

  # Seconds attributed to `user` from this project: their share of every journal entry's
  # hours (journal_seconds / |journal_attribution_set|) summed across journals they're in,
  # plus their per-member share of the admin-set manual_seconds.
  def user_logged_seconds(user)
    self.class.batch_user_logged_seconds([ id ], user)[id].to_i
  end

  # Approved counterpart of user_logged_seconds. Returns the user's proportional share of
  # this project's TA-blessed approved_public_seconds. Proportional split (rather than
  # journal-level approval) is used because approved_public_seconds is stored per ship,
  # not per journal — TA adjustments are still respected since the ratio is taken against
  # the raw project total. Sums across users always equal the project's approved total
  # (no double-counting), and a project with zero raw logged time contributes zero.
  def user_approved_seconds(user)
    self.class.batch_user_approved_seconds([ id ], user)[id].to_i
  end

  # Returns { project_id => seconds_attributed_to_user } across the given projects.
  # Iterates journal entries in Ruby after a pair of batched queries — N is bounded by
  # total kept journal entries on the requested projects, which is small per-user.
  def self.batch_user_logged_seconds(project_ids, user)
    return {} if project_ids.empty? || user.nil?

    project_by_je = JournalEntry.kept.where(project_id: project_ids).pluck(:id, :project_id).to_h
    user_seconds_by_je = JournalEntry.batch_user_attributed_seconds(project_by_je.keys, user)

    result = Hash.new(0)
    user_seconds_by_je.each { |je_id, secs| result[project_by_je[je_id]] += secs }

    member_counts = batch_member_counts(project_ids)
    manuals = where(id: project_ids).pluck(:id, :manual_seconds).to_h
    member_pids = project_ids_user_is_member_of(project_ids, user)
    project_ids.each do |pid|
      next unless member_pids.include?(pid)
      mc = member_counts[pid].to_i
      result[pid] += manuals[pid].to_i / mc if mc.positive?
    end

    result
  end

  # Returns { project_id => approved_seconds_attributed_to_user }. Uses the proportional
  # rule documented on user_approved_seconds: approved_public_seconds_P × user_share_P /
  # total_logged_P. Falls back to zero when total_logged_P is zero to avoid divide-by-zero.
  def self.batch_user_approved_seconds(project_ids, user)
    return {} if project_ids.empty? || user.nil?

    approved_by_project = Ship.approved
      .joins(:project)
      .where(projects: { id: project_ids, discarded_at: nil })
      .group("projects.id")
      .sum(:approved_public_seconds)
    return {} if approved_by_project.empty?

    candidate_ids = approved_by_project.keys
    total_by_project = batch_time_logged(candidate_ids)
    user_by_project = batch_user_logged_seconds(candidate_ids, user)

    candidate_ids.each_with_object({}) do |pid, h|
      approved = approved_by_project[pid].to_i
      total = total_by_project[pid].to_i
      user_share = user_by_project[pid].to_i
      h[pid] = total.positive? ? (approved * user_share) / total : 0
    end
  end

  # Admin-only variant of batch_user_approved_seconds that uses the *internal* approved
  # total per project — approved_public_seconds + DR.hours_adjustment + BR.hours_adjustment.
  # Same proportional split as the public version, so per-user sums equal each project's
  # internal-approved total. Used by the admin hours-stats dashboard's "build_approved" mode.
  def self.batch_user_internal_approved_seconds(project_ids, user)
    return {} if project_ids.empty? || user.nil?

    internal_by_project = Ship.where(status: :approved)
      .joins(:project)
      .left_joins(:design_review, :build_review)
      .where(projects: { id: project_ids, discarded_at: nil })
      .group("projects.id")
      .sum(Arel.sql("COALESCE(ships.approved_public_seconds, 0) + COALESCE(design_reviews.hours_adjustment, 0) + COALESCE(build_reviews.hours_adjustment, 0)"))
    return {} if internal_by_project.empty?

    candidate_ids = internal_by_project.keys
    total_by_project = batch_time_logged(candidate_ids)
    user_by_project = batch_user_logged_seconds(candidate_ids, user)

    candidate_ids.each_with_object({}) do |pid, h|
      internal = internal_by_project[pid].to_i
      total = total_by_project[pid].to_i
      user_share = user_by_project[pid].to_i
      h[pid] = total.positive? ? (internal * user_share) / total : 0
    end
  end

  # Set of project IDs (from the given list) where the user is either the kept owner or a
  # kept collaborator. Used to gate manual_seconds attribution: a user only gets a share of
  # manual_seconds on projects they actually belong to.
  def self.project_ids_user_is_member_of(project_ids, user)
    owners = where(id: project_ids, user_id: user.id).pluck(:id)
    collabs = Collaborator.kept
      .where(user: user, collaboratable_type: "Project", collaboratable_id: project_ids)
      .pluck(:collaboratable_id)
    (owners + collabs).to_set
  end

  # Batch version: returns { project_id => seconds } for a set of project IDs in a single query
  def self.batch_time_logged(project_ids)
    return {} if project_ids.empty?
    sql = <<~SQL.squish
      SELECT p.id,
        COALESCE(SUM(CASE r.recordable_type
          WHEN 'LapseTimelapse' THEN lt.duration
          WHEN 'LookoutTimelapse' THEN lot.duration
          WHEN 'YouTubeVideo' THEN yt.duration_seconds * yt.stretch_multiplier
          ELSE 0 END), 0) + p.manual_seconds AS total
      FROM projects p
      LEFT JOIN journal_entries je ON je.project_id = p.id AND je.discarded_at IS NULL
      LEFT JOIN recordings r ON r.journal_entry_id = je.id
      LEFT JOIN lapse_timelapses lt ON lt.id = r.recordable_id AND r.recordable_type = 'LapseTimelapse'
      LEFT JOIN lookout_timelapses lot ON lot.id = r.recordable_id AND r.recordable_type = 'LookoutTimelapse'
      LEFT JOIN you_tube_videos yt ON yt.id = r.recordable_id AND r.recordable_type = 'YouTubeVideo'
      WHERE p.id IN (:ids)
      GROUP BY p.id, p.manual_seconds
    SQL
    result = ActiveRecord::Base.connection.select_rows(
      ActiveRecord::Base.sanitize_sql([ sql, ids: project_ids ])
    )
    result.to_h { |pid, total| [ pid.to_i, total.to_i ] }
  end

  private

  def demo_video_link_required_when_built_irl
    return unless built_irl?
    return if demo_video_link.present?
    errors.add(:demo_video_link, "is required when the project is marked as built IRL")
  end

  def enqueue_meilisearch_reindex
    MeilisearchReindexJob.perform_later(self.class.name, id)
  end

  def enqueue_unified_thumbnail_compute_if_repo_changed
    return if destroyed?
    # Enqueue when there's actually work to do:
    # - created with a repo_link → fetch + attach
    # - repo_link changed (in either direction) → fetch+re-attach, OR clear+purge if now blank
    # - undiscarded with a repo_link → re-verify the cached attachment
    should_enqueue =
      (previously_new_record? && repo_link.present?) ||
      saved_change_to_repo_link? ||
      (saved_change_to_discarded_at? && discarded_at.nil? && repo_link.present?)
    return unless should_enqueue

    ComputeProjectUnifiedThumbnailJob.perform_later(id)
  end

  def broadcast_bulletin_explore_update
    return unless bulletin_explore_stats_changed?
    return unless bulletin_explore_public_now? || bulletin_explore_public_before_last_save?

    ActionCable.server.broadcast("live_updates:bulletin_explore", { stream: "bulletin_explore", action: "update" })
  end

  def bulletin_explore_stats_changed?
    previously_new_record? || destroyed? || saved_change_to_discarded_at? || saved_change_to_is_unlisted?
  end

  def bulletin_explore_public_now?
    discarded_at.nil? && !is_unlisted?
  end

  def bulletin_explore_public_before_last_save?
    kept_before = saved_change_to_discarded_at? ? discarded_at_before_last_save.nil? : discarded_at.nil?
    listed_before = saved_change_to_is_unlisted? ? !is_unlisted_before_last_save : !is_unlisted?

    kept_before && listed_before
  end
end
