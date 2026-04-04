module Reviewable
  extend ActiveSupport::Concern

  CLAIM_DURATION = 5.minutes
  REVIEW_MODELS = %w[TimeAuditReview RequirementsCheckReview DesignReview BuildReview].freeze

  included do
    has_paper_trail

    belongs_to :ship
    belongs_to :reviewer, class_name: "User", optional: true

    enum :status, { pending: 0, approved: 1, returned: 2, rejected: 3, cancelled: 4 }

    validates :status, presence: true
    validates :ship_id, uniqueness: true

    scope :actively_claimed, -> { where("claim_expires_at > ?", Time.current) }
    scope :available_for, ->(user) {
      pending.where(
        "claim_expires_at IS NULL OR claim_expires_at <= :now OR reviewer_id = :uid",
        now: Time.current, uid: user.id
      ).where.not(
        ship_id: Ship.where(project_id: ProjectFlag.select(:project_id)).select(:id)
      )
    }

    # Update Ship's cached status in the SAME transaction (not after_commit) to prevent drift
    after_save :recompute_ship_status!, if: :saved_change_to_status?
  end

  # -- Claim instance methods (use update_columns to bypass callbacks) --

  def claimed?
    claim_expires_at.present? && claim_expires_at > Time.current
  end

  def claimed_by?(user)
    claimed? && reviewer_id == user.id
  end

  def extend_claim!
    update_columns(claim_expires_at: CLAIM_DURATION.from_now) if claimed?
  end

  def release_claim!
    update_columns(reviewer_id: nil, claim_expires_at: nil)
  end

  class_methods do
    # Atomic claim: single UPDATE with WHERE guard prevents race conditions.
    # Returns true if the claim was acquired, false if someone else holds it.
    def atomic_claim!(review_id, user)
      now = Time.current
      rows = where(id: review_id, status: :pending)
        .where(
          "reviewer_id IS NULL OR reviewer_id = :uid OR claim_expires_at IS NULL OR claim_expires_at <= :now",
          uid: user.id, now: now
        )
        .update_all(
          reviewer_id: user.id,
          claim_expires_at: CLAIM_DURATION.from_now,
          updated_at: Time.current
        )
      rows == 1
    end

    # Release all active claims by a user. Scoped to pending reviews so
    # terminal reviews keep reviewer_id as an audit trail.
    def release_all_claims!(user)
      pending.where(reviewer_id: user.id).actively_claimed
        .update_all(reviewer_id: nil, claim_expires_at: nil)
    end

    # Returns the single review this user currently has claimed (if any).
    def active_claim_for(user)
      pending.actively_claimed.find_by(reviewer_id: user.id)
    end

    # Find the next review available for this user, respecting skip list.
    # Prioritises the user's own claim first, then oldest pending.
    def next_eligible(user, skip_ids: [])
      scope = available_for(user)
      scope = scope.where.not(id: skip_ids) if skip_ids.present?
      scope.order(
        Arel::Nodes::Case.new
          .when(arel_table[:reviewer_id].eq(user.id)).then(0)
          .else(1),
        :created_at
      ).first
    end
  end

  private

  def recompute_ship_status!
    ship.with_lock do
      ship.ensure_phase_two_review!
      ship.recompute_status!
    end
  end
end
