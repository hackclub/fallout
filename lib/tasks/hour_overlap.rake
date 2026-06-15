# frozen_string_literal: true

# READ-ONLY audit of cross-ship journal-hour overlap.
#
# Root cause: claiming (journal_entries.ship_id) is bounded at submission, but a ship's TA
# computes approved_public_seconds over Ship#new_journal_entries (created_at > cutoff, no
# upper bound). Entries logged during the review lag are counted by this ship's TA and then
# re-claimed/re-counted by the next ship — double-counting hours (and koi).
#
# A ship A "double-counts" entries created after its own submission but on/before its TA
# completion, when a later TA-approved ship B exists (B's window starts at A's submission, so
# B re-counts them). The correct fix is to subtract those entries' approved contribution from
# A — computed with A's OWN annotations, which cover them. B legitimately keeps them.
# This task writes NOTHING.
namespace :ships do
  desc "Report cross-ship journal-hour double-counting + koi impact (read-only)"
  task hour_overlap_report: :environment do
    KOI_RATE = 7

    # Mirrors Ship#compute_approved_public_seconds for an arbitrary entry set + annotations.
    approved_secs = lambda do |entries, annotations|
      total = 0.0
      entries.each do |entry|
        entry.recordings.each do |rec|
          ann = annotations.dig("recordings", rec.id.to_s) || {}
          yt = rec.recordable.is_a?(YouTubeVideo)
          multiplier = yt ? (ann["stretch_multiplier"]&.to_f || 1.0) : 60.0
          raw =
            case rec.recordable
            when LookoutTimelapse, LapseTimelapse then rec.recordable.duration.to_i
            when YouTubeVideo                     then rec.recordable.duration_seconds.to_i
            else 0
            end
          total += yt ? raw * multiplier : raw
          (ann["segments"] || []).each do |seg|
            real_range = (seg["end_seconds"].to_f - seg["start_seconds"].to_f) * multiplier
            case seg["type"]
            when "removed"  then total -= real_range
            when "deflated" then total -= real_range * (seg["deflated_percent"].to_f / 100)
            end
          end
        end
      end
      [ total.round, 0 ].max
    end

    koi_for = ->(seconds) { Rational(seconds.to_i * KOI_RATE, 3600).round }

    project_ids = Ship.joins(:time_audit_review)
      .where(time_audit_reviews: { status: TimeAuditReview.statuses[:approved] })
      .distinct.pluck(:project_id)

    rows = []
    project_ids.each do |pid|
      project = Project.find(pid)
      entries = project.journal_entries.kept.includes(recordings: :recordable).to_a
      # TA-approved ships with a completion time, ordered by submission.
      appr = project.ships.includes(:time_audit_review, :design_review).order(:created_at)
        .select { |s| s.time_audit_review&.approved? && s.time_audit_review.completed_at && s.time_audit_review.approved_public_seconds }

      appr.each do |ship|
        ta = ship.time_audit_review
        next_appr = appr.find { |b| b.created_at > ship.created_at }
        next unless next_appr # no later approved ship → not double-counted (handled by "expand" instead)

        # Entries A counted (review lag) that B's window (starts at A.submit) re-counts.
        dup = entries.select { |e| e.created_at > ship.created_at && e.created_at <= ta.completed_at }
        subtract = approved_secs.call(dup, ta.annotations || {})
        next if subtract <= 60

        stored = ta.approved_public_seconds.to_i
        corrected = [ stored - subtract, 0 ].max
        koi_awarded = ship.approved? && ship.ship_type_design?
        adj = ship.design_review&.koi_adjustment.to_i
        old_koi = koi_awarded ? koi_for.call(stored) + adj : 0
        new_koi = koi_awarded ? koi_for.call(corrected) + adj : 0

        rows << {
          ship: ship.id, project: pid, status: ship.status, dup_entries: dup.size,
          stored_h: (stored / 3600.0).round(2), corrected_h: (corrected / 3600.0).round(2),
          removed_h: (subtract / 3600.0).round(2),
          koi_awarded: koi_awarded, old_koi: old_koi, new_koi: new_koi, koi_delta: new_koi - old_koi
        }
      end
    end

    rows.sort_by! { |r| r[:koi_delta] }
    puts "ship|project|status|dup_entries|stored_h|corrected_h|removed_h|koi_awarded|old_koi|new_koi|koi_delta"
    rows.each do |r|
      puts "#{r[:ship]}|#{r[:project]}|#{r[:status]}|#{r[:dup_entries]}|#{r[:stored_h]}|#{r[:corrected_h]}|#{r[:removed_h]}|#{r[:koi_awarded]}|#{r[:old_koi]}|#{r[:new_koi]}|#{r[:koi_delta]}"
    end

    koi_rows = rows.select { |r| r[:koi_awarded] }
    puts "\n== summary =="
    puts "double-counting ships (TA approved, later approved ship exists): #{rows.size}"
    puts "total hours to un-count: #{rows.sum { |r| r[:removed_h] }.round(1)}"
    puts "of which koi-awarded (design + approved): #{koi_rows.size} ships"
    puts "total koi over-awarded (to claw back if chosen): #{koi_rows.sum { |r| r[:koi_delta] }}"
  end

  # Backfill for the going-forward fix. Dry-run by default; APPLY=1 to write.
  # For each approved ship, claim the entries its TA actually reviewed (bounded by
  # ta.completed_at) that aren't yet locked to it — both still-unclaimed (NULL) review-lag
  # entries AND entries stranded on a *later non-approved* ship (e.g. entry 10266, reviewed by
  # approved #539 but claimed by pending #874). new_journal_entries already excludes entries
  # owned by *other approved* ships, so this never disturbs a finalized cycle (keep-whole).
  # Currency-neutral: approved_public_seconds already counted these; this only aligns ship_id
  # so ship.total_hours matches the approval and the next cycle can't re-count them.
  desc "Backfill journal-hour ownership for the overlap fix (dry-run unless APPLY=1)"
  task fix_hour_overlap: :environment do
    apply = ENV["APPLY"] == "1"
    puts apply ? "== APPLY ==" : "== DRY RUN (set APPLY=1 to write) =="

    claimed = 0
    Ship.approved.includes(:time_audit_review).order(:created_at).find_each do |ship|
      completed_at = ship.time_audit_review&.completed_at
      next unless completed_at
      pending = ship.new_journal_entries
        .where("journal_entries.created_at <= ?", completed_at)
        .where("journal_entries.ship_id IS NULL OR journal_entries.ship_id <> ?", ship.id)
      n = pending.count
      next if n.zero?
      claimed += n
      puts "  ship ##{ship.id} (project #{ship.project_id}): claim #{n} entries (from #{pending.distinct.pluck(:ship_id).map { |i| i || 'nil' }.join(',')})"
      pending.update_all(ship_id: ship.id) if apply
    end
    puts "total entries #{apply ? 'claimed' : 'to claim'}: #{claimed}"
  end
end
