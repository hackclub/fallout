# Phase-two backfill claim system. Included only by DesignReview and BuildReview —
# the reviews whose internal justification (internal_reason) can be added after the
# fact. Kept separate from Reviewable so TA/RC (which lack the backfill_* columns)
# never gain these methods.
#
# Backfill claims are ISOLATED from the normal claim system: they use dedicated
# backfill_* columns and only ever touch approved rows, so a backfill claim never
# clobbers the original reviewer_id attribution and never releases (or is released
# by) a normal pending-review claim.
module Backfillable
  extend ActiveSupport::Concern

  # The phase-two review types that support backfilling.
  REVIEW_MODELS = %w[DesignReview BuildReview].freeze

  included do
    belongs_to :backfill_reviewer, class_name: "User", optional: true # who claimed/performed the backfill
  end

  def backfill_claimed?
    backfill_claim_expires_at.present? && backfill_claim_expires_at > Time.current
  end

  def backfill_claimed_by?(user)
    backfill_claimed? && backfill_reviewer_id == user.id
  end

  def extend_backfill_claim!
    update_columns(backfill_claim_expires_at: Reviewable::CLAIM_DURATION.from_now) if backfill_claimed?
  end

  class_methods do
    # Atomic claim guarded on approved status; returns true if acquired.
    def atomic_backfill_claim!(review_id, user)
      now = Time.current
      rows = approved.where(id: review_id)
        .where(
          "backfill_reviewer_id IS NULL OR backfill_reviewer_id = :uid OR backfill_claim_expires_at IS NULL OR backfill_claim_expires_at <= :now",
          uid: user.id, now: now
        )
        .update_all(
          backfill_reviewer_id: user.id,
          backfill_claim_expires_at: Reviewable::CLAIM_DURATION.from_now,
          updated_at: Time.current
        )
      rows == 1
    end

    def release_all_backfill_claims!(user)
      approved.where(backfill_reviewer_id: user.id)
        .where("backfill_claim_expires_at > ?", Time.current)
        .update_all(backfill_reviewer_id: nil, backfill_claim_expires_at: nil)
    end

    # Oldest submission first (chronological backfill). Approved + missing internal_reason,
    # not flagged, and available to claim by this user.
    def next_eligible_backfill(user, skip_ids: [])
      scope = approved
        .where("internal_reason IS NULL OR internal_reason = ''")
        .where.not(ship_id: Ship.where(project_id: ProjectFlag.select(:project_id)).select(:id))
        .where(
          "backfill_reviewer_id IS NULL OR backfill_reviewer_id = :uid OR backfill_claim_expires_at IS NULL OR backfill_claim_expires_at <= :now",
          uid: user.id, now: Time.current
        )
        .joins(:ship)
      scope = scope.where.not(id: skip_ids) if skip_ids.present?
      scope.order("ships.created_at ASC").first
    end
  end
end
