# == Schema Information
#
# Table name: users
#
#  id                          :bigint           not null, primary key
#  avatar                      :string           not null
#  ban_reason                  :text
#  ban_type                    :string
#  bio                         :text
#  device_token                :text
#  discarded_at                :datetime
#  display_name                :string           not null
#  email                       :string           not null
#  gold_balance                :integer          default(0), not null
#  has_hca_address             :boolean          default(FALSE), not null
#  hca_token                   :text
#  is_adult                    :boolean          default(FALSE), not null
#  is_banned                   :boolean          default(FALSE), not null
#  lapse_token                 :text
#  onboarded                   :boolean          default(FALSE), not null
#  pending_lookout_tokens      :string           default([]), not null, is an Array
#  pronouns                    :string
#  roles                       :string           default([]), not null, is an Array
#  slack_token                 :text
#  streak_freezes              :integer          default(1), not null
#  streak_in_app_notifications :boolean          default(TRUE), not null
#  streak_slack_notifications  :boolean          default(TRUE), not null
#  timezone                    :string           not null
#  type                        :string
#  verification_status         :string
#  created_at                  :datetime         not null
#  updated_at                  :datetime         not null
#  hca_id                      :string
#  slack_id                    :string
#
# Indexes
#
#  index_users_on_device_token        (device_token)
#  index_users_on_discarded_at        (discarded_at)
#  index_users_on_hca_id              (hca_id) UNIQUE WHERE (hca_id IS NOT NULL)
#  index_users_unique_verified_email  (email) UNIQUE WHERE ((type IS NULL) AND (discarded_at IS NULL))
#
require "test_helper"

class UserTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
