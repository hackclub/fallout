# == Schema Information
#
# Table name: reviewer_notes
#
#  id           :bigint           not null, primary key
#  body         :text             not null
#  review_stage :string
#  created_at   :datetime         not null
#  updated_at   :datetime         not null
#  project_id   :bigint           not null
#  ship_id      :bigint
#  user_id      :bigint           not null
#
# Indexes
#
#  index_reviewer_notes_on_project_id  (project_id)
#  index_reviewer_notes_on_ship_id     (ship_id)
#  index_reviewer_notes_on_user_id     (user_id)
#
# Foreign Keys
#
#  fk_rails_...  (project_id => projects.id)
#  fk_rails_...  (ship_id => ships.id)
#  fk_rails_...  (user_id => users.id)
#
class ReviewerNote < ApplicationRecord
  REVIEW_STAGES = %w[time_audit requirements_check design_review build_review].freeze

  has_paper_trail

  belongs_to :project
  belongs_to :user
  belongs_to :ship, optional: true

  validates :body, presence: true
  validates :review_stage, inclusion: { in: REVIEW_STAGES }, allow_nil: true
  validate :ship_belongs_to_project, if: -> { ship_id.present? }

  private

  def ship_belongs_to_project
    errors.add(:ship, "must belong to this project") unless ship&.project_id == project_id
  end
end
