# == Schema Information
#
# Table name: ships
#
#  id                      :bigint           not null, primary key
#  approved_public_seconds :integer
#  feedback                :text
#  frozen_demo_link        :string
#  frozen_hca_data         :text
#  frozen_repo_link        :string
#  frozen_screenshot       :string
#  justification           :string
#  preflight_results       :jsonb
#  returned_at             :datetime
#  ship_type               :integer          default("design"), not null
#  status                  :integer          default("pending"), not null
#  created_at              :datetime         not null
#  updated_at              :datetime         not null
#  preflight_run_id        :bigint
#  project_id              :bigint           not null
#  reviewer_id             :bigint
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
require "test_helper"

class ShipTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
