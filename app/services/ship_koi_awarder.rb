# Issues one ship_review koi transaction per non-trial kept project member when a ship
# reaches :approved. Koi is split evenly; the owner absorbs any integer remainder.
#
# Single source of truth for the awarding formula. Called from Ship#award_ship_review_koi!
# (after_update_commit) and from `rake koi:reconcile_ship_reviews` (operator-triggered
# backfill / safety-net). Idempotent per member — the partial unique index on
# koi_transactions(ship_id, user_id) WHERE reason = 'ship_review' is the guarantee.
#
# Returns an array of Results, one per eligible member, each tagged with one of:
#   :created                  — new KoiTransaction was inserted
#   :skipped_already_awarded  — DB unique index rejected the insert (race or replay)
#   :skipped_zero_amount      — hours+adjustments sum to 0; nothing to record
#   :skipped_trial_user       — all eligible members are trial users
#   :skipped_not_approved     — ship status is not :approved
class ShipKoiAwarder
  Result = Data.define(:status, :transaction, :amount)

  RATE_KOI_PER_HOUR = 7

  def self.call(ship)
    return [ Result.new(status: :skipped_not_approved, transaction: nil, amount: 0) ] unless ship.approved?

    members = eligible_members(ship)
    return [ Result.new(status: :skipped_trial_user, transaction: nil, amount: 0) ] if members.empty?

    total = compute_amount(ship)
    return [ Result.new(status: :skipped_zero_amount, transaction: nil, amount: 0) ] if total.zero?

    shares = compute_shares(total, members, ship.project.user_id)

    members.map do |member|
      amount = shares[member.id]
      desc = build_description(ship, amount, total, members.size)
      txn = KoiTransaction.create!(
        user: member,
        ship: ship,
        actor: nil,
        amount: amount,
        reason: "ship_review",
        description: desc
      )
      Result.new(status: :created, transaction: txn, amount: amount)
    rescue ActiveRecord::RecordNotUnique
      Result.new(status: :skipped_already_awarded, transaction: nil, amount: 0)
    end
  end

  # Public so the rake task / dry-run preview can show the would-be amount without inserting.
  #
  # Invariant: ship.approved_public_seconds is per-cycle by construction. It mirrors
  # time_audit_review.approved_public_seconds, which both the TA frontend
  # (pages/admin/reviews/time_audits/show.tsx) and the auto-approval path
  # (Ship#compute_approved_public_seconds via #carry_forward_ta_annotations!) compute
  # from ship.new_journal_entries — entries created strictly after
  # previous_approved_ship.created_at. So summing per-ship gives the correct
  # lifetime total without subtracting prior cycles. DO NOT swap to ship.total_hours
  # or any project-wide aggregator — those count the full history.
  def self.compute_amount(ship)
    seconds = ship.approved_public_seconds.to_i # Public/user-facing hours only — internal hours_adjustment is excluded by design
    hours_koi = Rational(seconds * RATE_KOI_PER_HOUR, 3600).round
    adjustment = ship.design_review&.koi_adjustment.to_i + ship.build_review&.koi_adjustment.to_i
    hours_koi + adjustment
  end

  def self.eligible_members(ship)
    owner = ship.project.user
    # Use the preloaded association when available (avoids N+1 in batch contexts).
    collab_users = ship.project.collaborators.map(&:user)
    ([ owner ] + collab_users).uniq { |u| u.id }.reject { |u| u.trial? || u.discarded? }
  end

  # Distributes total evenly; owner absorbs integer remainder (falls back to first member
  # if the owner is not eligible, e.g. trial user).
  def self.compute_shares(total, members, owner_id)
    n = members.size
    base = total / n
    remainder = total % n
    recipient_id = members.find { |u| u.id == owner_id }&.id || members.first.id
    members.to_h { |u| [ u.id, u.id == recipient_id ? base + remainder : base ] }
  end

  def self.build_description(ship, amount, total, member_count)
    seconds = ship.approved_public_seconds.to_i
    hours = (seconds / 3600.0).round(2)
    base_koi = Rational(seconds * RATE_KOI_PER_HOUR, 3600).round
    description = "Ship ##{ship.id} approved — #{hours} hrs × #{RATE_KOI_PER_HOUR} koi"
    if total != base_koi
      adjustment = total - base_koi
      sign = adjustment >= 0 ? "+" : "−"
      description += " #{sign} #{adjustment.abs} koi review adjustment"
    end
    description += " = #{total} total / #{member_count} members (your share: #{amount})" if member_count > 1
    description
  end
end
