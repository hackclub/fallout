# == Schema Information
#
# Table name: debt_snapshots
#
#  id                          :bigint           not null, primary key
#  approved_seconds            :integer          default(0), not null
#  approved_seconds_by_project :jsonb            not null
#  computed_at                 :datetime         not null
#  cutoff_at                   :datetime         not null
#  created_at                  :datetime         not null
#  updated_at                  :datetime         not null
#  user_id                     :bigint           not null
#
# Indexes
#
#  index_debt_snapshots_on_cutoff_at              (cutoff_at)
#  index_debt_snapshots_on_user_id                (user_id)
#  index_debt_snapshots_on_user_id_and_cutoff_at  (user_id,cutoff_at) UNIQUE
#
# Foreign Keys
#
#  fk_rails_...  (user_id => users.id)
#
# A frozen, point-in-time record of a ticket-holder's TA-approved hours as of a cutoff. The debt
# console judges debt against this snapshot (approved-as-of-cutoff < 60h) rather than live hours, so
# work approved after the cutoff can't retroactively clear someone's debt. The cutoff is a fixed
# point in the past, so the figure never changes once built — the page reads it in O(1) instead of
# recomputing the (expensive) attribution walk on every load.
#
# Rebuild with `bin/rails debt:snapshot`. See DebtSnapshotBuilder for the reconstruction.
class DebtSnapshot < ApplicationRecord
  # The program's approved-hours deadline: July 1, 2026, program-local (Pacific). Debt is measured
  # against approved state as it stood at this instant.
  CUTOFF = ActiveSupport::TimeZone["America/Los_Angeles"].local(2026, 7, 1).freeze

  belongs_to :user

  validates :cutoff_at, presence: true
  validates :user_id, uniqueness: { scope: :cutoff_at }

  # True once a snapshot has been built for the cutoff. Guards the debt console against silently
  # flagging every ticket-holder as in-debt when the backfill simply hasn't run yet.
  def self.built_for?(cutoff = CUTOFF)
    where(cutoff_at: cutoff).exists?
  end

  # jsonb round-trips project-id keys as strings; the roster keys projects by integer id.
  def approved_by_project_ints
    approved_seconds_by_project.transform_keys(&:to_i)
  end
end
