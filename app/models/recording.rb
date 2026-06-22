# == Schema Information
#
# Table name: recordings
#
#  id               :bigint           not null, primary key
#  recordable_type  :string           not null
#  created_at       :datetime         not null
#  updated_at       :datetime         not null
#  journal_entry_id :bigint           not null
#  recordable_id    :bigint           not null
#  user_id          :bigint           not null
#
# Indexes
#
#  index_recordings_on_journal_entry_id                   (journal_entry_id)
#  index_recordings_on_recordable_type_and_recordable_id  (recordable_type,recordable_id) UNIQUE
#  index_recordings_on_user_id                            (user_id)
#
# Foreign Keys
#
#  fk_rails_...  (journal_entry_id => journal_entries.id)
#  fk_rails_...  (user_id => users.id)
#
class Recording < ApplicationRecord
  # Destroying a Recording (e.g., on journal discard) must NOT destroy the underlying
  # LapseTimelapse/YouTubeVideo — they are cached data that persists independently.
  delegated_type :recordable, types: %w[LapseTimelapse YouTubeVideo LookoutTimelapse]

  belongs_to :journal_entry
  belongs_to :user

  validates :recordable_type, uniqueness: { scope: :recordable_id, message: "is already claimed by another journal" } # DB unique index enforces this too
  validate :user_must_match_journal_user

  # Enqueue activity analysis when a recording is attached to a journal entry
  after_create_commit :enqueue_activity_check
  # Archive Lapse footage + metadata to R2 (disaster-recovery copy) on attach. after_create_commit
  # so the timelapse row is committed/visible before the job runs; idempotent (skips if archived).
  after_create_commit :enqueue_lapse_archive, if: -> { recordable_type == "LapseTimelapse" }

  private

  def enqueue_activity_check
    # YouTube footage is activity-checked only by YouTubeTimelapseService once an admin processes it
    # into a 60× timelapse — the plain checker can't download YouTube and would stamp an empty result,
    # so it must stay the sole writer of YouTube inactive_segments/activity_checked_at.
    return if recordable_type == "YouTubeVideo"

    TimelapseActivityCheckJob.perform_later(recordable)
  end

  def enqueue_lapse_archive
    ArchiveLapseTimelapseJob.perform_later(recordable_id)
  end

  def user_must_match_journal_user
    errors.add(:journal_entry, "must belong to the same user") if journal_entry && journal_entry.user_id != user_id
  end
end
