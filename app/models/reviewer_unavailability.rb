# == Schema Information
#
# Table name: reviewer_unavailabilities
#
#  id          :bigint           not null, primary key
#  ends_on     :date             not null
#  reason      :string
#  starts_on   :date             not null
#  created_at  :datetime         not null
#  updated_at  :datetime         not null
#  reviewer_id :bigint           not null
#
# Indexes
#
#  index_reviewer_unavailabilities_on_reviewer_id  (reviewer_id)
#
# Foreign Keys
#
#  fk_rails_...  (reviewer_id => users.id)
#
class ReviewerUnavailability < ApplicationRecord
  belongs_to :reviewer, class_name: "User"

  validates :starts_on, :ends_on, presence: true
  validate :ends_on_not_before_starts_on

  private

  def ends_on_not_before_starts_on
    return unless starts_on && ends_on
    errors.add(:ends_on, "must be on or after start date") if ends_on < starts_on
  end
end
