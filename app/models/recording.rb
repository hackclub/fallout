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
  delegated_type :recordable, types: %w[LapseTimelapse YouTubeVideo CollapseTimelapse]

  belongs_to :journal_entry
  belongs_to :user

  validates :recordable_type, uniqueness: { scope: :recordable_id, message: "is already claimed by another journal" } # DB unique index enforces this too
  validate :user_must_match_journal_user

  private

  def user_must_match_journal_user
    errors.add(:journal_entry, "must belong to the same user") if journal_entry && journal_entry.user_id != user_id
  end
end
