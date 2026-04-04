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
require "test_helper"

class ReviewerNoteTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
