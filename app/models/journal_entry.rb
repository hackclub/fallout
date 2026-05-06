# == Schema Information
#
# Table name: journal_entries
#
#  id           :bigint           not null, primary key
#  content      :text
#  discarded_at :datetime
#  created_at   :datetime         not null
#  updated_at   :datetime         not null
#  project_id   :bigint           not null
#  ship_id      :bigint
#  user_id      :bigint           not null
#
# Indexes
#
#  index_journal_entries_on_content_trgm  (content) USING gin
#  index_journal_entries_on_discarded_at  (discarded_at)
#  index_journal_entries_on_project_id    (project_id)
#  index_journal_entries_on_ship_id       (ship_id)
#  index_journal_entries_on_user_id       (user_id)
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

  pg_search_scope :search,
                  against: :content,
                  associated_against: { project: %i[name description] },
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
