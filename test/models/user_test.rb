# == Schema Information
#
# Table name: users
#
#  id                  :bigint           not null, primary key
#  avatar              :string           not null
#  display_name        :string           not null
#  email               :string           not null
#  hca_token           :text
#  is_adult            :boolean          default(FALSE), not null
#  is_banned           :boolean          default(FALSE), not null
#  phone               :string
#  role                :integer          default("user"), not null
#  timezone            :string           not null
#  verification_status :string
#  created_at          :datetime         not null
#  updated_at          :datetime         not null
#  slack_id            :string           not null
#
require "test_helper"

class UserTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
