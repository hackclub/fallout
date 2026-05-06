# == Schema Information
#
# Table name: hcb_transactions
#
#  id                :bigint           not null, primary key
#  amount_cents      :integer          not null
#  declined          :boolean          default(FALSE), not null
#  last_synced_at    :datetime
#  memo              :string
#  merchant_name     :string
#  pending           :boolean          default(FALSE), not null
#  reversed          :boolean          default(FALSE), not null
#  transaction_date  :datetime         not null
#  transaction_type  :string
#  created_at        :datetime         not null
#  updated_at        :datetime         not null
#  hcb_grant_card_id :bigint           not null
#  hcb_id            :string           not null
#
# Indexes
#
#  index_hcb_transactions_on_card_and_date      (hcb_grant_card_id,transaction_date)
#  index_hcb_transactions_on_hcb_grant_card_id  (hcb_grant_card_id)
#  index_hcb_transactions_on_hcb_id             (hcb_id) UNIQUE
#  index_hcb_transactions_on_transaction_type   (transaction_type)
#
# Foreign Keys
#
#  fk_rails_...  (hcb_grant_card_id => hcb_grant_cards.id)
#
require "test_helper"

class HcbTransactionTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
