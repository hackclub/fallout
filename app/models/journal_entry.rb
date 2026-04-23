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

  has_paper_trail

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

  def unclaim_recordings
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
