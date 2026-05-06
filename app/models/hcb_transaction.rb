# frozen_string_literal: true

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
class HcbTransaction < ApplicationRecord
  has_paper_trail

  belongs_to :hcb_grant_card

  validates :hcb_id, presence: true, uniqueness: true
  validates :amount_cents, presence: true
  validates :transaction_date, presence: true

  before_destroy { raise ActiveRecord::ReadonlyRecord } # Sync manages lifecycle

  scope :pending, -> { where(pending: true) }
  scope :settled, -> { where(pending: false, declined: false, reversed: false) }
  scope :declined, -> { where(declined: true) }
  scope :reversed, -> { where(reversed: true) }
  scope :recent, -> { order(transaction_date: :desc) }
  # Only real card spend. Excludes org↔card ledger movement (topups, withdrawals,
  # initial grant issuance) which are internal bookkeeping, not user-visible activity.
  scope :purchases, -> { where(transaction_type: "purchase") }

  def settled?
    !pending && !declined && !reversed
  end

  def stale?
    last_synced_at.nil? || last_synced_at < 15.minutes.ago
  end

  def display_merchant
    merchant_name.presence || memo.presence || "Unknown"
  end
end
