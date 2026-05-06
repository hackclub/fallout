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
    validate :status_transition_allowed, if: :status_changed?

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

    # Set to true to skip recompute_ship_status! (e.g. during bulk cancellation where the caller recomputes once)
    attr_accessor :skip_ship_recompute
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
    # All four review types sync to a single unified Airtable table — rows are
    # disambiguated by a prefixed "Review ID" (TA12, RC12, DR12, BR12). Each
    # review subclass must define `review_id_prefix`; type-specific columns are
    # contributed via `extra_review_field_mappings`.
    AIRTABLE_REVIEWS_TABLE_ID = "tblH5ENbMHrWR6hyd"
    AIRTABLE_REVIEWS_SYNC_ID = "J3D2bzea"

    def airtable_sync_table_id
      AIRTABLE_REVIEWS_TABLE_ID
    end

    def airtable_sync_sync_id
      AIRTABLE_REVIEWS_SYNC_ID
    end

    def airtable_should_batch
      true
    end

    def airtable_batch_size
      2000
    end

    def airtable_sync_preload(records)
      ship_ids = records.map(&:ship_id).compact.uniq
      # user_id lives on projects, not ships — join and use Arel.sql for the
      # qualified column (bare strings in pluck go through attribute-name
      # resolution in Rails 8.1).
      ships_by_id = Ship.where(id: ship_ids).joins(:project)
                        .pluck(:id, :project_id, Arel.sql("projects.user_id"))
                        .to_h { |id, pid, uid| [ id, [ pid, uid ] ] }
      { ships: ships_by_id }
    end

    def airtable_sync_field_mappings
      base_review_field_mappings.merge(extra_review_field_mappings)
    end

    def review_id_prefix
      raise NotImplementedError, "#{name} must define review_id_prefix"
    end

    def extra_review_field_mappings
      {}
    end

    def base_review_field_mappings
      {
        "Review ID" => ->(r) { "#{r.class.review_id_prefix}#{r.id}" },
        "Review Type" => ->(r) { r.class.name },
        "Ship ID" => :ship_id,
        "Project ID" => ->(r, pre) { pre[:ships][r.ship_id]&.first },
        "User ID" => ->(r, pre) { pre[:ships][r.ship_id]&.last },
        "Reviewer ID" => :reviewer_id,
        "Status" => ->(r) { r.status },
        "Feedback" => :feedback,
        "Created At" => ->(r) { r.created_at&.iso8601 },
        "Updated At" => ->(r) { r.updated_at&.iso8601 }
      }
    end

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

  TERMINAL_STATUSES = %w[approved returned rejected cancelled].freeze

  # Prevent modifications once a review reaches a terminal state (approved/returned/rejected/cancelled)
  def status_transition_allowed
    return if new_record?
    return unless TERMINAL_STATUSES.include?(status_was)
    errors.add(:status, "cannot transition from #{status_was}")
  end

  def recompute_ship_status!
    return if skip_ship_recompute
    ship.with_lock do
      ship.ensure_phase_two_review!
      ship.recompute_status!
    end
  end
end
