# frozen_string_literal: true

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
class HcbGrantCard < ApplicationRecord
  STATUSES = %w[active canceled expired].freeze

  has_paper_trail

  belongs_to :user
  has_many :hcb_transactions, dependent: :delete_all # delete_all bypasses HcbTransaction's before_destroy guard
  has_many :project_funding_topups, dependent: :restrict_with_error

  validates :hcb_id, uniqueness: true, allow_nil: true
  validates :status, presence: true, inclusion: { in: STATUSES }
  validates :amount_cents, presence: true, numericality: { greater_than: 0 }
  validates :purpose, length: { maximum: 30 }, allow_blank: true
  validate :one_active_per_user, on: :create

  scope :active, -> { where(status: "active") }
  scope :canceled, -> { where(status: "canceled") }
  scope :non_canceled, -> { where.not(status: "canceled") }
  scope :issued, -> { where.not(hcb_id: nil) }
  scope :unissued, -> { where(hcb_id: nil) }

  def issued?
    hcb_id.present?
  end

  def active?
    status == "active"
  end

  def canceled?
    status == "canceled"
  end

  def expired?
    status == "expired"
  end

  # Issues this card grant on HCB. Creates the card grant via the API and
  # stores the returned hcb_id. Raises if already issued or if the API call fails.
  def issue!
    raise HcbService::Error, "Card grant already issued (hcb_id: #{hcb_id})" if issued?

    params = {
      amount_cents: amount_cents,
      email: user.email,
      purpose: purpose,
      one_time_use: one_time_use,
      pre_authorization_required: pre_authorization_required,
      merchant_lock: merchant_lock,
      category_lock: category_lock,
      keyword_lock: keyword_lock
    }
    params[:expiration_at] = expires_on.to_s if expires_on.present?
    params[:instructions] = instructions if instructions.present?
    params[:invite_message] = invite_message if invite_message.present?

    data = HcbService.create_card_grant(params)

    update!(
      hcb_id: data[:id],
      email: data[:email],
      card_id: data[:card_id],
      expires_on: data[:expires_on],
      status: data[:status] || "active",
      last_synced_at: Time.current
    )
  end

  def cancel!
    update!(status: "canceled", canceled_at: Time.current)
  end

  def stale?
    last_synced_at.nil? || last_synced_at < 15.minutes.ago
  end

  private

  def one_active_per_user
    return unless active?

    if self.class.active.where(user_id: user_id).exists?
      errors.add(:user, "already has an active card grant")
    end
  end
end
