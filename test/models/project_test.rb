# == Schema Information
#
# Table name: projects
#
#  id                    :bigint           not null, primary key
#  demo_link             :string
#  description           :text
#  discarded_at          :datetime
#  inactivity_dm_sent_at :datetime
#  is_unlisted           :boolean          default(FALSE), not null
#  manual_seconds        :integer          default(0), not null
#  name                  :string           not null
#  repo_link             :string
#  tags                  :string           default([]), not null, is an Array
#  created_at            :datetime         not null
#  updated_at            :datetime         not null
#  user_id               :bigint           not null
#
# Indexes
#
#  index_projects_on_description_trgm  (description) USING gin
#  index_projects_on_discarded_at      (discarded_at)
#  index_projects_on_is_unlisted       (is_unlisted)
#  index_projects_on_name_trgm         (name) USING gin
#  index_projects_on_tags              (tags) USING gin
#  index_projects_on_user_id           (user_id)
#
# Foreign Keys
#
#  fk_rails_...  (user_id => users.id)
#
require "test_helper"

class ProjectTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
