# Issues a single ship_review koi transaction when a ship reaches :approved.
#
# Single source of truth for the awarding formula. Called from Ship#award_ship_review_koi!
# (after_update_commit) and from `rake koi:reconcile_ship_reviews` (operator-triggered
# backfill / safety-net). Idempotent — the partial unique index on
# koi_transactions(ship_id) WHERE reason = 'ship_review' is the absolute guarantee.
#
# Returns a Result tagged with one of:
#   :created                  — new KoiTransaction was inserted
#   :skipped_already_awarded  — DB unique index rejected the insert (race or replay)
#   :skipped_zero_amount      — hours+adjustments sum to 0; nothing to record
#   :skipped_trial_user       — trial users do not earn koi
#   :skipped_not_approved     — ship status is not :approved
class ShipKoiAwarder
  Result = Data.define(:status, :transaction, :amount)

  RATE_KOI_PER_HOUR = 7

  def self.call(ship)
    return Result.new(status: :skipped_not_approved, transaction: nil, amount: 0) unless ship.approved?
    return Result.new(status: :skipped_trial_user,   transaction: nil, amount: 0) if ship.user.trial?

    amount = compute_amount(ship)
    return Result.new(status: :skipped_zero_amount, transaction: nil, amount: 0) if amount.zero?

    txn = KoiTransaction.create!(
      user: ship.user,
      ship: ship,
      actor: nil, # System-generated; reviewer attribution lives on the individual reviews
      amount: amount,
      reason: "ship_review",
      description: build_description(ship, amount)
    )
    Result.new(status: :created, transaction: txn, amount: amount)
  rescue ActiveRecord::RecordNotUnique
    # DB-enforced idempotency — another caller already awarded this ship.
    Result.new(status: :skipped_already_awarded, transaction: nil, amount: 0)
  end

  # Public so the rake task / dry-run preview can show the would-be amount without inserting.
  #
  # Invariant: ship.approved_seconds is per-cycle by construction. It mirrors
  # time_audit_review.approved_seconds, which both the TA frontend
  # (pages/admin/reviews/time_audits/show.tsx) and the auto-approval path
  # (Ship#compute_approved_seconds via #carry_forward_ta_annotations!) compute
  # from ship.new_journal_entries — entries created strictly after
  # previous_approved_ship.created_at. So summing per-ship gives the correct
  # lifetime total without subtracting prior cycles. DO NOT swap to ship.total_hours
  # or any project-wide aggregator — those count the full history.
  def self.compute_amount(ship)
    seconds = ship.approved_seconds.to_i # Public/user-facing hours only — internal hours_adjustment is excluded by design
    hours_koi = Rational(seconds * RATE_KOI_PER_HOUR, 3600).round
    adjustment = ship.design_review&.koi_adjustment.to_i + ship.build_review&.koi_adjustment.to_i
    hours_koi + adjustment
  end

  def self.build_description(ship, total)
    seconds = ship.approved_seconds.to_i
    hours = (seconds / 3600.0).round(2)
    base_koi = Rational(seconds * RATE_KOI_PER_HOUR, 3600).round
    description = "Ship ##{ship.id} approved — #{hours} hrs × #{RATE_KOI_PER_HOUR} koi"
    if total != base_koi
      adjustment = total - base_koi
      sign = adjustment >= 0 ? "+" : "−"
      description += " #{sign} #{adjustment.abs} koi review adjustment"
    end
    description
  end
end
