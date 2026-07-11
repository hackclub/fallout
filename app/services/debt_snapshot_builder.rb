# Rebuilds DebtSnapshot rows: the frozen, as-of-cutoff TA-approved hours the debt console judges
# debt against. Because the cutoff is a fixed point in the past, this runs once (offline, via the
# `debt:snapshot` rake task) and the page then reads the materialized result in O(1).
#
# Reconstruction strategy — mirror the live approved-hours math (Project.batch_user_approved_seconds
# and its helpers) but source the *structure* from PaperTrail as it stood at the cutoff:
#
#   approved_P × user_share_P ÷ approved_cycle_total_P
#
# What is frozen to the cutoff (all `has_paper_trail`): each ship's status and approved_public_seconds,
# and each journal entry's kept/ship_id/author state and its journal-level collaborators. What stays
# live (decided with the deadline owner): journal clip *durations* — they aren't versioned and rarely
# change, so `batch_time_logged` reads current values. Manual seconds / project membership don't enter
# approved attribution at all, so they're irrelevant here.
#
# Assumption (documented, low-risk): a user's *set* of attributable projects is taken from the current
# `projects_attributable_to_self_ids`. Ownership/collaboration/authorship are additive over the program,
# and any project a user wasn't attributable to at the cutoff contributes zero approved seconds anyway.
#
# Per-record reification is used deliberately — slow but exactly PaperTrail's own semantics — because a
# one-time offline backfill needn't be fast. Reification is memoized per project across users.
class DebtSnapshotBuilder
  def initialize(cutoff = DebtSnapshot::CUTOFF)
    @cutoff = cutoff
    @approved_ship_info = {}
    @cycle = {}
  end

  # Rebuilds snapshots for every current approved-ticket holder. Idempotent: upserts one row per user.
  def self.rebuild!(cutoff = DebtSnapshot::CUTOFF)
    new(cutoff).rebuild!
  end

  def rebuild!
    users = User.joins(:ticket_claim).merge(TicketClaim.approved).distinct.to_a
    users.each { |user| upsert_for(user) }
    users.size
  end

  private

  def upsert_for(user)
    by_project = approved_seconds_by_project(user)
    row = DebtSnapshot.find_or_initialize_by(user_id: user.id, cutoff_at: @cutoff)
    row.approved_seconds = by_project.values.sum
    row.approved_seconds_by_project = by_project
    row.computed_at = Time.current
    row.save!
  end

  # { project_id => approved_seconds_attributed_to_user } as of the cutoff.
  def approved_seconds_by_project(user)
    user.projects_attributable_to_self_ids.each_with_object({}) do |pid, acc|
      approved = approved_ship_info(pid)[:seconds]
      next if approved.zero?

      cycle = project_approved_cycle(pid)
      next if cycle[:total].zero?

      user_share = cycle[:jes].sum do |je|
        attr_set = ([ je[:author_id] ] | je[:extra_ids]).uniq.compact
        next 0 unless attr_set.include?(user.id)
        je[:seconds] / attr_set.size
      end
      next if user_share.zero?

      value = (approved * user_share) / cycle[:total]
      acc[pid] = value if value.positive?
    end
  end

  # { seconds:, ship_ids: Set } — approved-at-cutoff ships of the project and their frozen
  # approved_public_seconds. Ships aren't soft-deleted, so any ship present now with created_at
  # <= cutoff existed then; reify to recover its status/seconds as of the cutoff.
  def approved_ship_info(pid)
    @approved_ship_info[pid] ||= begin
      seconds = 0
      ship_ids = Set.new
      Ship.where(project_id: pid).where("created_at <= ?", @cutoff).find_each do |ship|
        frozen = ship.paper_trail.version_at(@cutoff)
        next unless frozen&.approved?
        seconds += frozen.approved_public_seconds.to_i
        ship_ids << ship.id
      end
      { seconds:, ship_ids: }
    end
  end

  # { total:, jes: [{ id, author_id, seconds, extra_ids }] } — the approved-cycle journal entries of
  # the project as of the cutoff (kept, attached to a ship that was approved at the cutoff), with
  # current durations and cutoff-frozen authorship/collaborator attribution.
  def project_approved_cycle(pid)
    @cycle[pid] ||= begin
      ship_ids = approved_ship_info(pid)[:ship_ids]
      rows = []
      if ship_ids.any?
        JournalEntry.where(project_id: pid).where("created_at <= ?", @cutoff).find_each do |je|
          frozen = je.paper_trail.version_at(@cutoff)
          next unless frozen && frozen.discarded_at.nil?
          next unless frozen.ship_id && ship_ids.include?(frozen.ship_id)
          rows << { id: je.id, author_id: frozen.user_id }
        end
        durations = JournalEntry.batch_time_logged(rows.map { |r| r[:id] })
        extras = journal_collaborators_at(rows.map { |r| r[:id] })
        rows.each do |r|
          r[:seconds] = durations[r[:id]].to_i
          r[:extra_ids] = extras[r[:id]] || []
        end
      end
      { total: rows.sum { |r| r[:seconds] }, jes: rows }
    end
  end

  # { journal_entry_id => [user_id, ...] } — kept journal-level collaborators as of the cutoff whose
  # user isn't currently discarded. Mirrors JournalEntry.batch_attributed_user_ids (which filters
  # discarded users on current state) but freezes collaborator membership to the cutoff.
  def journal_collaborators_at(je_ids)
    return {} if je_ids.empty?

    live_user_ids = User.kept.where(id: collaborator_user_ids(je_ids)).pluck(:id).to_set
    extras = Hash.new { |h, k| h[k] = [] }
    Collaborator.where(collaboratable_type: "JournalEntry", collaboratable_id: je_ids)
      .where("created_at <= ?", @cutoff).find_each do |collab|
      frozen = collab.paper_trail.version_at(@cutoff)
      next unless frozen && frozen.discarded_at.nil?
      next unless live_user_ids.include?(frozen.user_id)
      extras[frozen.collaboratable_id] << frozen.user_id
    end
    extras
  end

  def collaborator_user_ids(je_ids)
    Collaborator.where(collaboratable_type: "JournalEntry", collaboratable_id: je_ids)
      .where("created_at <= ?", @cutoff).distinct.pluck(:user_id)
  end
end
