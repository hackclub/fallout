# == Schema Information
#
# Table name: users
#
#  id                  :bigint           not null, primary key
#  avatar              :string           not null
#  device_token        :string
#  discarded_at        :datetime
#  display_name        :string           not null
#  email               :string           not null
#  hca_token           :text
#  is_adult            :boolean          default(FALSE), not null
#  is_banned           :boolean          default(FALSE), not null
#  lapse_token         :text
#  roles               :string           default([]), not null, is an Array
#  timezone            :string           not null
#  type                :string
#  verification_status :string
#  created_at          :datetime         not null
#  updated_at          :datetime         not null
#  hca_id              :string
#  slack_id            :string
#
# Indexes
#
#  index_users_on_device_token        (device_token)
#  index_users_on_discarded_at        (discarded_at)
#  index_users_unique_verified_email  (email) UNIQUE WHERE ((type IS NULL) AND (discarded_at IS NULL))
#
require "test_helper"

class UserTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
