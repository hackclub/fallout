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

  has_one :time_audit_review
  has_one :requirements_check_review
  has_one :design_review
  has_one :build_review
  has_many :reviewer_notes, dependent: :nullify
  has_many :project_flags, dependent: :nullify

  enum :status, { pending: 0, approved: 1, returned: 2, rejected: 3 }
  enum :ship_type, { design: 0, build: 1 }, prefix: true

  serialize :frozen_hca_data, coder: JSON
  encrypts :frozen_hca_data

  validates :status, presence: true

  delegate :user, to: :project

  scope :for_user, ->(user) { joins(:project).where(projects: { user_id: user.id }) }
  scope :with_reviews, -> {
    includes(:time_audit_review, :requirements_check_review, :design_review, :build_review)
  }

  after_create_commit :create_initial_reviews!
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
    update!(status: new_status) if status != new_status
    cancel_pending_reviews! if returned? || rejected?
  end

  private

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
      review.update!(status: :cancelled) if review.pending?
    end
  end

  def create_initial_reviews!
    TimeAuditReview.create!(ship: self)
    RequirementsCheckReview.create!(ship: self)
  end

  def notify_status_change
    MailDeliveryService.ship_status_changed(self)
  end
end
