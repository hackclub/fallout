# == Schema Information
#
# Table name: featured_projects
#
#  id                  :bigint           not null, primary key
#  discarded_at        :datetime
#  featured_at         :datetime         not null
#  note                :text
#  position            :integer          default(0), not null
#  created_at          :datetime         not null
#  updated_at          :datetime         not null
#  featured_by_user_id :bigint           not null
#  project_id          :bigint           not null
#
# Indexes
#
#  index_featured_projects_on_discarded_at         (discarded_at)
#  index_featured_projects_on_featured_by_user_id  (featured_by_user_id)
#  index_featured_projects_on_position             (position)
#  index_featured_projects_on_project_id           (project_id)
#  index_featured_projects_unique_active_project   (project_id) UNIQUE WHERE (discarded_at IS NULL)
#
# Foreign Keys
#
#  fk_rails_...  (featured_by_user_id => users.id)
#  fk_rails_...  (project_id => projects.id)
#
class FeaturedProject < ApplicationRecord
  include Discardable
  include Broadcastable

  # Public bulletin board re-fetches the Featured prop when any featured-project record changes
  # (create, drag-reorder, unfeature, restore).
  broadcasts_updates_to :featured_projects

  belongs_to :project
  belongs_to :featured_by_user, class_name: "User"

  validates :featured_at, presence: true
  validates :position, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
  validate :project_must_be_kept_and_listed, on: :create

  scope :ordered, -> { order(:position, :featured_at) }

  private

  def project_must_be_kept_and_listed
    return unless project

    errors.add(:project, "is deleted") if project.discarded?
    errors.add(:project, "is unlisted") if project.is_unlisted?
  end
end
