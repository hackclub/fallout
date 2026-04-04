# == Schema Information
#
# Table name: project_flags
#
#  id           :bigint           not null, primary key
#  reason       :text             not null
#  review_stage :string
#  created_at   :datetime         not null
#  updated_at   :datetime         not null
#  project_id   :bigint           not null
#  ship_id      :bigint
#  user_id      :bigint           not null
#
# Indexes
#
#  index_project_flags_on_project_id  (project_id)
#  index_project_flags_on_ship_id     (ship_id)
#  index_project_flags_on_user_id     (user_id)
#
# Foreign Keys
#
#  fk_rails_...  (project_id => projects.id)
#  fk_rails_...  (ship_id => ships.id)
#  fk_rails_...  (user_id => users.id)
#
class ProjectFlag < ApplicationRecord
  has_paper_trail

  belongs_to :project
  belongs_to :user
  belongs_to :ship, optional: true

  validates :reason, presence: true
  validates :review_stage, inclusion: { in: ReviewerNote::REVIEW_STAGES }, allow_nil: true
end
