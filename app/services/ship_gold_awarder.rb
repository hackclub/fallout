# Issues one ship_review gold transaction per non-trial kept project member when a
# BUILD ship reaches :approved. Gold is split evenly; the owner absorbs any integer
# remainder. Design ships award koi via ShipKoiAwarder instead (DR → koi, BR → gold).
#
# Mirrors ShipKoiAwarder's split semantics so collaborators on a shared project receive
# their share of both currencies. The partial unique index on
# gold_transactions(ship_id, user_id) WHERE reason = 'ship_review' guarantees one award
# per member per ship.
#
# Returns an array of Results, one per eligible member, each tagged with one of:
#   :created                  — new GoldTransaction was inserted
#   :skipped_already_awarded  — DB unique index rejected the insert (race or replay)
#   :skipped_zero_amount      — hours+adjustments sum to 0; nothing to record
#   :skipped_trial_user       — all eligible members are trial users
#   :skipped_not_approved     — ship status is not :approved
#   :skipped_wrong_ship_type  — ship is not a build ship (gold is BR-only)
class ShipGoldAwarder
  Result = Data.define(:status, :transaction, :amount)

  RATE_GOLD_PER_HOUR = 7 # Same rate as koi — symmetry between DR/BR currencies

  def self.call(ship)
    return [ Result.new(status: :skipped_not_approved,    transaction: nil, amount: 0) ] unless ship.approved?
    return [ Result.new(status: :skipped_wrong_ship_type, transaction: nil, amount: 0) ] unless ship.ship_type_build?

    members = ShipKoiAwarder.eligible_members(ship)
    return [ Result.new(status: :skipped_trial_user, transaction: nil, amount: 0) ] if members.empty?

    total = compute_amount(ship)
    return [ Result.new(status: :skipped_zero_amount, transaction: nil, amount: 0) ] if total.zero?

    shares = ShipKoiAwarder.compute_shares(total, members, ship.project.user_id)

    members.map do |member|
      amount = shares[member.id]
      desc = build_description(ship, amount, total, members.size)
      txn = GoldTransaction.create!(
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

  # Public so the BR show page preview / reconciliation can compute without inserting.
  # Same per-cycle invariant as ShipKoiAwarder.compute_amount — ship.approved_public_seconds
  # is for THIS ship's cycle only, so re-ship BRs award only their incremental hours.
  def self.compute_amount(ship)
    seconds = ship.approved_public_seconds.to_i # Public/user-facing hours only — internal hours_adjustment excluded by design
    hours_gold = Rational(seconds * RATE_GOLD_PER_HOUR, 3600).round
    adjustment = ship.build_review&.gold_adjustment.to_i
    hours_gold + adjustment
  end

  def self.build_description(ship, amount, total, member_count)
    seconds = ship.approved_public_seconds.to_i
    hours = (seconds / 3600.0).round(2)
    base_gold = Rational(seconds * RATE_GOLD_PER_HOUR, 3600).round
    description = "Ship ##{ship.id} (build) approved — #{hours} hrs × #{RATE_GOLD_PER_HOUR} gold"
    if total != base_gold
      adjustment = total - base_gold
      sign = adjustment >= 0 ? "+" : "−"
      description += " #{sign} #{adjustment.abs} gold review adjustment"
    end
    description += " = #{total} total / #{member_count} members (your share: #{amount})" if member_count > 1
    description
  end
end
