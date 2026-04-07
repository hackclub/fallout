# == Schema Information
#
# Table name: ships
#
#  id                :bigint           not null, primary key
#  approved_seconds  :integer
#  feedback          :text
#  frozen_demo_link  :string
#  frozen_hca_data   :text
#  frozen_repo_link  :string
#  frozen_screenshot :string
#  justification     :string
#  preflight_results :jsonb
#  ship_type         :integer          default("design"), not null
#  status            :integer          default("pending"), not null
#  created_at        :datetime         not null
#  updated_at        :datetime         not null
#  preflight_run_id  :bigint
#  project_id        :bigint           not null
#  reviewer_id       :bigint
#
# Indexes
#
#  index_ships_on_preflight_run_id  (preflight_run_id)
#  index_ships_on_project_id        (project_id)
#  index_ships_on_reviewer_id       (reviewer_id)
#  index_ships_on_ship_type         (ship_type)
#  index_ships_on_status            (status)
#
# Foreign Keys
#
#  fk_rails_...  (preflight_run_id => preflight_runs.id)
#  fk_rails_...  (project_id => projects.id)
#  fk_rails_...  (reviewer_id => users.id)
#
class Ship < ApplicationRecord
  has_paper_trail

  belongs_to :project
  belongs_to :reviewer, class_name: "User", optional: true
  belongs_to :preflight_run, optional: true # Older ships predate PreflightRun tracking

  has_one :time_audit_review, dependent: :destroy
  has_one :requirements_check_review, dependent: :destroy
  has_one :design_review, dependent: :destroy
  has_one :build_review, dependent: :destroy
  has_many :journal_entries, dependent: :nullify
  has_many :reviewer_notes, dependent: :nullify
  has_many :project_flags, dependent: :nullify

  enum :status, { pending: 0, approved: 1, returned: 2, rejected: 3 }
  enum :ship_type, { design: 0, build: 1 }, prefix: true

  serialize :frozen_hca_data, coder: JSON
  encrypts :frozen_hca_data

  validates :status, presence: true
  validate :status_transition_allowed, if: :status_changed?

  delegate :user, to: :project

  scope :for_user, ->(user) { joins(:project).where(projects: { user_id: user.id }) }
  scope :with_reviews, -> {
    includes(:time_audit_review, :requirements_check_review, :design_review, :build_review)
  }

  after_create :claim_journal_entries! # Assign this cycle's entries to this ship (runs in same transaction)
  after_create :create_initial_reviews! # after_create (not after_commit) so reviews are created in the same transaction — partial creation rolls back the ship
  after_update_commit :notify_status_change, if: :saved_change_to_status?

  def review_status
    {
      time_audit: time_audit_review&.status,
      requirements_check: requirements_check_review&.status,
      design_review: design_review&.status,
      build_review: build_review&.status
    }
  end

  def previous_approved_ship
    project.ships.approved.where("created_at < ?", created_at).order(created_at: :desc).first
  end

  def new_journal_entries
    cutoff = previous_approved_ship&.created_at || Time.at(0)
    project.journal_entries.kept.where("created_at > ?", cutoff)
  end

  def previous_journal_entries
    cutoff = previous_approved_ship&.created_at || Time.at(0)
    project.journal_entries.kept.where("created_at <= ?", cutoff)
  end

  def total_hours
    (journal_entries.kept.joins(:recordings)
      .sum(Arel.sql(<<~SQL.squish)) / 3600.0).round(1)
        CASE recordings.recordable_type
          WHEN 'LapseTimelapse' THEN (SELECT duration FROM lapse_timelapses WHERE id = recordings.recordable_id)
          WHEN 'LookoutTimelapse' THEN (SELECT duration FROM lookout_timelapses WHERE id = recordings.recordable_id)
          WHEN 'YouTubeVideo' THEN (SELECT duration_seconds FROM you_tube_videos WHERE id = recordings.recordable_id)
          ELSE 0
        END
      SQL
  end

  # Query DB directly (not association cache) for correctness under concurrency
  def phase_one_complete?
    TimeAuditReview.where(ship_id: id, status: :approved).exists? &&
      RequirementsCheckReview.where(ship_id: id, status: :approved).exists?
  end

  def ensure_phase_two_review!
    return unless phase_one_complete?

    review_class = ship_type_design? ? DesignReview : BuildReview
    review_class.find_or_create_by!(ship: self)
  end

  def recompute_status!
    new_status = derive_status
    sync_approved_seconds_from_ta!
    if status != new_status
      attrs = { status: new_status }
      # Aggregate reviewer feedback onto the ship so MailDeliveryService includes it in notifications
      attrs[:feedback] = aggregate_return_feedback if new_status == "returned"
      update!(attrs)
    end
    cancel_pending_reviews! if returned? || rejected?
  end

  # Keep ship.approved_seconds in sync with the TA review's approved_seconds
  def sync_approved_seconds_from_ta!
    ta = time_audit_review
    return unless ta&.approved? && ta.approved_seconds.present?
    return if approved_seconds == ta.approved_seconds
    update_columns(approved_seconds: ta.approved_seconds)
  end

  private

  # Claim this cycle's journal entries — entries not locked to an approved ship get assigned to this ship.
  # Entries already assigned to an approved ship are immutable (that cycle is finalized).
  def claim_journal_entries!
    approved_ship_ids = project.ships.approved.pluck(:id)
    scope = new_journal_entries
    scope = if approved_ship_ids.any?
      scope.where("ship_id IS NULL OR ship_id NOT IN (?)", approved_ship_ids)
    else
      scope # No approved ships — all entries are claimable
    end
    scope.update_all(ship_id: id)
  end

  TERMINAL_STATUSES = %w[approved returned rejected].freeze

  # Prevent admin from bypassing the review pipeline by directly changing a terminal ship status
  def status_transition_allowed
    return if new_record?
    return unless TERMINAL_STATUSES.include?(status_was)
    errors.add(:status, "cannot transition from #{status_was}")
  end

  def derive_status
    reviews = [ time_audit_review, requirements_check_review, phase_two_review ].compact
    return "pending" if reviews.empty?
    return "rejected" if reviews.any?(&:rejected?)
    return "returned" if reviews.any?(&:returned?)
    return "approved" if reviews.all?(&:approved?)
    "pending"
  end

  def phase_two_review
    ship_type_design? ? design_review : build_review
  end

  def cancel_pending_reviews!
    [ time_audit_review, requirements_check_review, design_review, build_review ].compact.each do |review|
      next unless review.pending?
      review.skip_ship_recompute = true # Ship status is already set by the caller — skip redundant recomputations
      review.update!(status: :cancelled)
    end
  end

  def create_initial_reviews!
    ta = TimeAuditReview.create!(ship: self)
    RequirementsCheckReview.create!(ship: self)
    carry_forward_ta_annotations!(ta)
  end

  def carry_forward_ta_annotations!(ta)
    prev_ship = project.ships.where.not(id: id).order(created_at: :desc).first
    prev_ta = prev_ship&.time_audit_review
    return unless prev_ta&.approved? && prev_ta.annotations&.dig("recordings")&.any?

    reviewed_ids = prev_ta.annotations["recordings"].keys.to_set
    current_ids = new_journal_entries
      .joins(:recordings)
      .pluck("recordings.id").map(&:to_s).to_set

    carried = prev_ta.annotations.deep_dup
    carried["recordings"].select! { |id, _| current_ids.include?(id) }

    new_recordings = current_ids - reviewed_ids

    if new_recordings.empty?
      # All current recordings already reviewed — auto-approve with recomputed time
      ta.update!(
        status: :approved,
        annotations: carried,
        approved_seconds: compute_approved_seconds(carried)
      )
    elsif carried["recordings"].any?
      # New recordings need review; carry forward existing annotations
      ta.update_columns(annotations: carried, updated_at: Time.current)
    end
  end

  def compute_approved_seconds(annotations)
    total = 0
    new_journal_entries.includes(recordings: :recordable).each do |entry|
      entry.recordings.each do |rec|
        duration =
          case rec.recordable
          when LookoutTimelapse, LapseTimelapse then rec.recordable.duration.to_i
          when YouTubeVideo then rec.recordable.duration_seconds.to_i
          else 0
          end
        total += duration
        segments = annotations.dig("recordings", rec.id.to_s, "segments") || []
        segments.each do |seg|
          video_range = seg["end_seconds"].to_f - seg["start_seconds"].to_f
          real_range = video_range * 60
          case seg["type"]
          when "removed" then total -= real_range
          when "deflated" then total -= real_range * (seg["deflated_percent"].to_f / 100)
          end
        end
      end
    end
    [ total.round, 0 ].max
  end

  def aggregate_return_feedback
    [ time_audit_review, requirements_check_review, design_review, build_review ]
      .compact.select(&:returned?).filter_map(&:feedback).join("\n\n---\n\n")
  end

  def notify_status_change
    MailDeliveryService.ship_status_changed(self)
  rescue => e
    Rails.logger.error("Ship##{id} status notification failed: #{e.message}")
  end
end
