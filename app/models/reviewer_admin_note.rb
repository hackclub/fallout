# == Schema Information
#
# Table name: reviewer_admin_notes
#
#  id          :bigint           not null, primary key
#  body        :text             not null
#  created_at  :datetime         not null
#  updated_at  :datetime         not null
#  author_id   :bigint           not null
#  reviewer_id :bigint           not null
#
# Indexes
#
#  index_reviewer_admin_notes_on_author_id    (author_id)
#  index_reviewer_admin_notes_on_reviewer_id  (reviewer_id)
#
# Foreign Keys
#
#  fk_rails_...  (author_id => users.id)
#  fk_rails_...  (reviewer_id => users.id)
#
class ReviewerAdminNote < ApplicationRecord
  belongs_to :reviewer, class_name: "User"
  belongs_to :author, class_name: "User"

  validates :body, presence: true
end
