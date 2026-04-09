# == Schema Information
#
# Table name: hcb_connections
#
#  id               :bigint           not null, primary key
#  access_token     :text
#  connected_at     :datetime
#  refresh_token    :text
#  token_expires_at :datetime
#  created_at       :datetime         not null
#  updated_at       :datetime         not null
#  connected_by_id  :bigint           not null
#
# Indexes
#
#  index_hcb_connections_on_connected_by_id  (connected_by_id)
#
# Foreign Keys
#
#  fk_rails_...  (connected_by_id => users.id)
#
require "test_helper"

class HcbConnectionTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
