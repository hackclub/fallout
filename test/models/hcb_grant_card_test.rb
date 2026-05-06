# == Schema Information
#
# Table name: hcb_grant_cards
#
#  id                         :bigint           not null, primary key
#  amount_cents               :integer          not null
#  balance_cents              :integer
#  canceled_at                :datetime
#  category_lock              :string           default([]), not null, is an Array
#  email                      :string
#  expires_on                 :date
#  instructions               :text
#  invite_message             :text
#  keyword_lock               :string
#  last4                      :string
#  last_synced_at             :datetime
#  merchant_lock              :string           default([]), not null, is an Array
#  one_time_use               :boolean          default(FALSE), not null
#  pre_authorization_required :boolean          default(FALSE), not null
#  purpose                    :string
#  status                     :string           default("active"), not null
#  created_at                 :datetime         not null
#  updated_at                 :datetime         not null
#  card_id                    :string
#  hcb_id                     :string
#  user_id                    :bigint           not null
#
# Indexes
#
#  index_hcb_grant_cards_on_hcb_id                 (hcb_id) UNIQUE
#  index_hcb_grant_cards_on_user_id                (user_id)
#  index_hcb_grant_cards_on_user_id_active_unique  (user_id) UNIQUE WHERE ((status)::text = 'active'::text)
#  index_hcb_grant_cards_on_user_id_and_status     (user_id,status)
#
# Foreign Keys
#
#  fk_rails_...  (user_id => users.id)
#
require "test_helper"

class HcbGrantCardTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
