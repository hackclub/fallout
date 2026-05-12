# When a build ship reaches :approved for the first time on a project, sweep each
# eligible member's project-attributable koi into gold up to their lifetime
# project-koi cap. Fires once per project (first BR approval), not on subsequent
# BR re-ships — built_irl flips on once and stays.
#
# Formula per member m:
#   m_lifetime_koi  = sum(KoiTransaction.where(reason: 'ship_review', user_id: m,
#                                              ship_id: project.ship_ids))
#   convertible     = [m.koi_balance_now, m_lifetime_koi].min
#
# This naturally enforces "non-project koi (streak / admin) never converts" — the
# project's lifetime award cap excludes those sources. See arch-ship-and-koi.md for
# the proof that this min(balance, project_award_cap) formula is hindsight-optimal
# for max-gold attribution of past spending.
#
# Idempotent — the partial unique indexes on
#   koi_transactions(ship_id, user_id) WHERE reason = 'built_irl_conversion'
#   gold_transactions(ship_id, user_id) WHERE reason = 'built_irl_conversion'
# guarantee at most one koi/gold conversion pair per (BR ship, user). A transfer_id
# UUID links each member's koi/gold pair for explicit auditability.
#
# Result tags:
#   :converted                — koi/gold pair created
#   :skipped_already_converted — DB unique index rejected (race or replay)
#   :skipped_zero_amount       — convertible is 0 (no koi to convert)
#   :skipped_trial_user        — member is a trial user (no koi balance)
#   :skipped_not_approved      — ship not :approved
#   :skipped_wrong_ship_type   — ship is not build-type
#   :skipped_not_first_build   — project already had an earlier approved build ship
class BuiltIrlConversionService
  Result = Data.define(:status, :user_id, :amount, :transfer_id)

  def self.call(ship)
    return [ Result.new(status: :skipped_not_approved,    user_id: nil, amount: 0, transfer_id: nil) ] unless ship.approved?
    return [ Result.new(status: :skipped_wrong_ship_type, user_id: nil, amount: 0, transfer_id: nil) ] unless ship.ship_type_build?

    members = ShipKoiAwarder.eligible_members(ship)
    return [ Result.new(status: :skipped_trial_user, user_id: nil, amount: 0, transfer_id: nil) ] if members.empty?

    # Pessimistic project lock — serializes concurrent BR approvals on the same project
    # so the "first BR" check + writes are atomic. Without this, two BRs approved in
    # parallel could both see "no other approved BR" and both perform a conversion.
    # The per-(ship_id, user_id) unique index doesn't catch that since ship_ids differ.
    ship.project.with_lock do
      other_built = ship.project.ships.approved
                        .where(ship_type: :build)
                        .where.not(id: ship.id)
                        .exists?
      if other_built
        [ Result.new(status: :skipped_not_first_build, user_id: nil, amount: 0, transfer_id: nil) ]
      else
        members.map { |member| convert_for_member(ship, member) }
      end
    end
  end

  # Public so the BR show page preview can show "Approval will convert N koi → N gold"
  # for the current viewer (or for the owner) without inserting anything.
  def self.compute_amount(ship, user)
    return 0 if user.trial?
    return 0 unless ship.ship_type_build?

    lifetime_cap = KoiTransaction.where(
      reason: "ship_review",
      ship_id: ship.project.ships.select(:id),
      user_id: user.id
    ).sum(:amount)

    [ user.koi, lifetime_cap ].min.clamp(0, nil)
  end

  def self.convert_for_member(ship, member)
    convertible = compute_amount(ship, member)
    return Result.new(status: :skipped_zero_amount, user_id: member.id, amount: 0, transfer_id: nil) if convertible <= 0

    transfer_id = SecureRandom.uuid

    ActiveRecord::Base.transaction do
      KoiTransaction.create!(
        user: member,
        ship: ship,
        actor: nil,
        amount: -convertible,
        reason: "built_irl_conversion",
        description: "Project ##{ship.project_id} built — #{convertible} koi converted to gold",
        transfer_id: transfer_id
      )
      GoldTransaction.create!(
        user: member,
        ship: ship,
        actor: nil,
        amount: convertible,
        reason: "built_irl_conversion",
        description: "Project ##{ship.project_id} built — #{convertible} koi converted from koi",
        transfer_id: transfer_id
      )
    end

    Result.new(status: :converted, user_id: member.id, amount: convertible, transfer_id: transfer_id)
  rescue ActiveRecord::RecordNotUnique
    Result.new(status: :skipped_already_converted, user_id: member.id, amount: 0, transfer_id: nil)
  end
end
