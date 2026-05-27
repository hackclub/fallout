# == Schema Information
#
# Table name: reviewer_week_resolutions
#
#  id          :bigint           not null, primary key
#  reason      :string
#  week_start  :date             not null
#  created_at  :datetime         not null
#  updated_at  :datetime         not null
#  author_id   :bigint           not null
#  reviewer_id :bigint           not null
#
# Indexes
#
#  index_reviewer_week_resolutions_on_author_id                   (author_id)
#  index_reviewer_week_resolutions_on_reviewer_id                 (reviewer_id)
#  index_reviewer_week_resolutions_on_reviewer_id_and_week_start  (reviewer_id,week_start) UNIQUE
#
# Foreign Keys
#
#  fk_rails_...  (author_id => users.id)
#  fk_rails_...  (reviewer_id => users.id)
#
class ReviewerWeekResolution < ApplicationRecord
  belongs_to :reviewer, class_name: "User"
  belongs_to :author, class_name: "User"

  validates :week_start, presence: true
  validates :reviewer_id, uniqueness: { scope: :week_start }
end
