# == Schema Information
#
# Table name: journal_entries
#
#  id                       :bigint           not null, primary key
#  burnout_duration_seconds :integer
#  content                  :text
#  discarded_at             :datetime
#  created_at               :datetime         not null
#  updated_at               :datetime         not null
#  project_id               :bigint           not null
#  ship_id                  :bigint
#  user_id                  :bigint           not null
#
# Indexes
#
#  index_journal_entries_on_discarded_at     (discarded_at)
#  index_journal_entries_on_project_id       (project_id)
#  index_journal_entries_on_search_tsvector  (to_tsvector('simple'::regconfig, COALESCE(content, ''::text))) USING gin
#  index_journal_entries_on_ship_id          (ship_id)
#  index_journal_entries_on_user_id          (user_id)
#
# Foreign Keys
#
#  fk_rails_...  (project_id => projects.id)
#  fk_rails_...  (ship_id => ships.id)
#  fk_rails_...  (user_id => users.id)
#
class JournalEntry < ApplicationRecord
  include Discardable
  include PgSearch::Model
  include MeiliSearch::Rails
  include Broadcastable

  has_paper_trail

  # Content-only so the GIN expression index on journal_entries can serve the
  # query — an associated_against join would force a per-row tsvector recompute.
  # Call sites that also need project name/description matches use
  # search_including_project below.
  pg_search_scope :search,
                  against: :content,
                  using: { tsearch: { prefix: true } }

  meilisearch auto_index: false, auto_remove: false do
    attribute :content
    attribute :project_name do
      project.name
    end
    attribute :project_description do
      project.description
    end
    attribute :created_at do
      created_at.to_i
    end
    attribute :project_id
    attribute :owner_name do
      project.user.display_name
    end
    attribute :collaborator_names do
      (project.collaborator_users + collaborator_users).map(&:display_name).uniq
    end
    searchable_attributes %w[content project_name project_description owner_name collaborator_names]
    ranking_rules %w[words typo proximity attribute sort exactness]
    sortable_attributes %w[created_at]
    filterable_attributes %w[project_id]
  end

  # Live-update the owner's path page on create/update/destroy. Discards are updates
  # (set discarded_at), so the owner's star count recomputes when entries are discarded.
  # Collaborator fan-out happens via the Collaborator model's own broadcast.
  broadcasts_updates_to { "path_user_#{user_id}" }

  belongs_to :user
  belongs_to :project
  belongs_to :ship, optional: true # Set when a ship claims this entry; locked once the ship is approved
  has_many :recordings, dependent: :destroy
  has_many :lapse_timelapses, through: :recordings, source: :recordable, source_type: "LapseTimelapse"
  has_many :you_tube_videos, through: :recordings, source: :recordable, source_type: "YouTubeVideo"
  has_many :critters, dependent: :nullify
  has_many :collaborators, -> { kept }, as: :collaboratable, dependent: :destroy
  has_many :collaborator_users, through: :collaborators, source: :user
  has_many_attached :images

  validate :user_must_own_or_collaborate_on_project
  validate :validate_image_content_types
  validate :validate_image_sizes
  validate :validate_image_count

  # Re-encode uploads to strip EXIF/GPS and defeat polyglots. Runs async to avoid blocking save.
  after_commit :reprocess_images, on: [ :create, :update ]
  # Dirty-only public stats refresh; payload intentionally omits journal IDs.
  after_commit :broadcast_bulletin_explore_update
  after_commit :enqueue_meilisearch_reindex

  # Public Explore feed: kept entries on kept + listed projects. Re-evaluated per request,
  # so a project flipping to is_unlisted or being discarded immediately removes its entries.
  scope :public_for_explore, -> {
    kept.where(project_id: Project.public_for_explore.select(:id))
  }

  # Meilisearch-down fallback that mirrors the Meilisearch index's project_name
  # coverage: content matches OR entries of projects whose name/description
  # match. Both subqueries are served by GIN expression indexes; reorder(nil)
  # strips pg_search's rank ORDER BY so the tsvector isn't recomputed for
  # ordering inside the subquery.
  def self.search_including_project(query)
    where(id: search(query).reorder(nil).select(:id))
      .or(where(project_id: Project.search(query).reorder(nil).select(:id)))
  end

  def time_logged
    self.class.batch_time_logged([ id ])[id].to_i
  end

  # Users who share credit for this journal entry's hours: the author plus every kept
  # collaborator whose user is still kept. Returns a deduped array — the author may also
  # be in collaborator_users on legacy rows (the validator forbids it for new ones), and
  # we treat that as a single share.
  def attributed_user_ids
    ([ user_id ] | self.class.batch_attributed_user_ids([ id ])[id].to_a).uniq
  end

  # Returns { journal_entry_id => seconds } summing recording durations across LapseTimelapse,
  # LookoutTimelapse, and YouTubeVideo (stretch-multiplied) for the given IDs. Mirrors the
  # join logic in Project.batch_time_logged but groups by journal, not project.
  def self.batch_time_logged(journal_entry_ids)
    return {} if journal_entry_ids.empty?
    sql = <<~SQL.squish
      SELECT je.id,
        COALESCE(SUM(CASE r.recordable_type
          WHEN 'LapseTimelapse' THEN lt.duration
          WHEN 'LookoutTimelapse' THEN lot.duration
          WHEN 'YouTubeVideo' THEN yt.duration_seconds * yt.stretch_multiplier
          ELSE 0 END), 0) AS total
      FROM journal_entries je
      LEFT JOIN recordings r ON r.journal_entry_id = je.id
      LEFT JOIN lapse_timelapses lt ON lt.id = r.recordable_id AND r.recordable_type = 'LapseTimelapse'
      LEFT JOIN lookout_timelapses lot ON lot.id = r.recordable_id AND r.recordable_type = 'LookoutTimelapse'
      LEFT JOIN you_tube_videos yt ON yt.id = r.recordable_id AND r.recordable_type = 'YouTubeVideo'
      WHERE je.id IN (:ids)
      GROUP BY je.id
    SQL
    result = ActiveRecord::Base.connection.select_rows(
      ActiveRecord::Base.sanitize_sql([ sql, ids: journal_entry_ids ])
    )
    result.to_h { |jeid, total| [ jeid.to_i, total.to_i ] }
  end

  # Returns { journal_entry_id => [user_id, ...] } of kept collaborators (kept users only)
  # per journal entry. Excludes the author — callers union with `user_id` themselves so they
  # can decide whether to include a discarded author.
  def self.batch_attributed_user_ids(journal_entry_ids)
    return {} if journal_entry_ids.empty?
    Collaborator.kept
      .joins("INNER JOIN users ON users.id = collaborators.user_id AND users.discarded_at IS NULL")
      .where(collaboratable_type: "JournalEntry", collaboratable_id: journal_entry_ids)
      .pluck(:collaboratable_id, :user_id)
      .group_by(&:first)
      .transform_values { |pairs| pairs.map(&:last) }
  end

  # Returns { journal_entry_id => seconds_attributed_to_user } for journals where the user
  # is in the attribution set (author or kept journal-level collaborator). Journals the user
  # isn't on are omitted from the result (not zero — caller can `.to_h` and check). Shared
  # by streak/reminder/per-project rollups so attribution logic lives in one place.
  def self.batch_user_attributed_seconds(journal_entry_ids, user)
    return {} if journal_entry_ids.empty? || user.nil?
    seconds_by_je = batch_time_logged(journal_entry_ids)
    extras_by_je = batch_attributed_user_ids(journal_entry_ids)
    authors_by_je = where(id: journal_entry_ids).pluck(:id, :user_id).to_h
    journal_entry_ids.each_with_object({}) do |je_id, h|
      author_id = authors_by_je[je_id]
      next unless author_id
      attr_set = ([ author_id ] | (extras_by_je[je_id] || [])).uniq
      next unless attr_set.include?(user.id)
      seconds = seconds_by_je[je_id].to_i
      h[je_id] = seconds / attr_set.size if attr_set.any?
    end
  end

  private

  def user_must_own_or_collaborate_on_project
    return unless project && user
    errors.add(:user, "must own or collaborate on the project") unless project.owner_or_collaborator?(user)
  end

  def validate_image_content_types
    images.each do |image|
      unless image.content_type.in?(%w[image/png image/jpeg image/gif image/webp])
        errors.add(:images, "must be PNG, JPEG, GIF, or WebP")
        break
      end
    end
  end

  def validate_image_sizes
    images.each do |image|
      if image.byte_size > 10.megabytes
        errors.add(:images, "must be less than 10 MB each")
        break
      end
    end
  end

  def validate_image_count
    errors.add(:images, "cannot exceed 20") if images.size > 20
  end

  def reprocess_images
    images.attachments.each do |attachment|
      ReprocessJournalImageJob.perform_later(attachment.id)
    end
  end

  def enqueue_meilisearch_reindex
    MeilisearchReindexJob.perform_later(self.class.name, id)
  end

  def broadcast_bulletin_explore_update
    return unless bulletin_explore_stats_changed?
    return unless bulletin_explore_public_now? || bulletin_explore_public_before_last_save?

    ActionCable.server.broadcast("live_updates:bulletin_explore", { stream: "bulletin_explore", action: "update" })
  end

  def bulletin_explore_stats_changed?
    previously_new_record? || destroyed? || saved_change_to_discarded_at? || saved_change_to_project_id?
  end

  def bulletin_explore_public_now?
    discarded_at.nil? && bulletin_explore_public_project?(project)
  end

  def bulletin_explore_public_before_last_save?
    kept_before = saved_change_to_discarded_at? ? discarded_at_before_last_save.nil? : discarded_at.nil?

    kept_before && bulletin_explore_public_project?(bulletin_explore_project_before_last_save)
  end

  def bulletin_explore_project_before_last_save
    return project unless saved_change_to_project_id?

    Project.find_by(id: project_id_before_last_save)
  end

  def bulletin_explore_public_project?(project)
    project.present? && project.discarded_at.nil? && !project.is_unlisted?
  end

  def unclaim_recordings
    # Restore Lookout session tokens to the user's pending list before destroying the recordings
    # so the surviving LookoutTimelapse rows can be re-attached to a new journal entry.
    # Lapse/YouTube don't need this — they're (re)claimed by id, not by consumable token.
    lookout_tokens = recordings.includes(:recordable).filter_map do |r|
      r.recordable.session_token if r.recordable.is_a?(LookoutTimelapse)
    end
    if lookout_tokens.any?
      user.update!(pending_lookout_tokens: user.pending_lookout_tokens | lookout_tokens)
    end
    recordings.destroy_all
  end

  public

  # Override Discardable#discard to also unclaim recordings so timelapses/videos can be reused.
  # Both steps run in a single transaction so a partial failure can never leave the journal marked
  # discarded while recordings still hold the (recordable_type, recordable_id) unique slot.
  def discard
    transaction do
      unclaim_recordings
      super
    end
  rescue ActiveRecord::RecordNotDestroyed, ActiveRecord::RecordInvalid => e
    ErrorReporter.capture_exception(e, level: :warning, contexts: { journal_entry: { id: id, project_id: project_id } })
    false
  end
end
