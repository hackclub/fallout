# frozen_string_literal: true

# == Schema Information
#
# Table name: project_grant_orders
#
#  id                :bigint           not null, primary key
#  admin_note        :text
#  discarded_at      :datetime
#  frozen_koi_amount :integer          not null
#  frozen_usd_cents  :integer          not null
#  state             :string           default("pending"), not null
#  created_at        :datetime         not null
#  updated_at        :datetime         not null
#  user_id           :bigint           not null
#
# Indexes
#
#  index_project_grant_orders_on_discarded_at  (discarded_at)
#  index_project_grant_orders_on_state         (state)
#  index_project_grant_orders_on_user_id       (user_id)
#
# Foreign Keys
#
#  fk_rails_...  (user_id => users.id)
#
class ProjectGrantOrder < ApplicationRecord
  include Discardable

  STATES = %w[pending fulfilled rejected on_hold].freeze

  has_paper_trail
  belongs_to :user
  has_many :project_funding_topups, dependent: :restrict_with_error

  enum :state, { pending: "pending", fulfilled: "fulfilled", rejected: "rejected", on_hold: "on_hold" }, default: "pending"

  # User specifies USD they need; we derive the koi cost from current rate and snapshot both.
  # Both must be set before validation runs because the columns are NOT NULL.
  before_validation :snapshot_koi_cost_from_usd, on: :create

  validates :frozen_usd_cents, presence: true, numericality: { greater_than: 0, only_integer: true }
  validates :frozen_koi_amount, presence: true, numericality: { greater_than: 0, only_integer: true }
  validates :state, inclusion: { in: STATES }
  # Project grants move real money — trials don't have the verified identity HCB expects.
  validate :user_must_be_full_account, on: :create
  # Mirrors ShopOrder#user_can_afford: blocks at form submission rather than letting an
  # admin discover the user couldn't pay only after they're sitting in the review queue.
  validate :user_can_afford_koi, on: :create

  # NOTE on fulfilled→rejected: this transition IS allowed and will refund koi to the
  # user via `User#koi` (which excludes rejected orders from the deduction). It does NOT
  # automatically claw money back on HCB — the admin is responsible for reconciling the
  # HCB side via the "Record adjustment" flow if needed. This decoupling is intentional:
  # real-world refunds are messy (invoicing, partial recovery) and the admin needs
  # flexibility over what goes in the ledger.

  # Financial data — never hard-destroy.
  def destroy
    raise ActiveRecord::ReadOnlyRecord, "ProjectGrantOrder cannot be destroyed; use #discard instead"
  end

  private

  def snapshot_koi_cost_from_usd
    return unless frozen_usd_cents.is_a?(Integer) && frozen_usd_cents.positive?

    self.frozen_koi_amount ||= HcbGrantSetting.current.koi_for_usd_cents(frozen_usd_cents)
  end

  def user_must_be_full_account
    return unless user
    return unless user.trial?

    errors.add(:user, "cannot be a trial user — project grants require a full account")
  end

  def user_can_afford_koi
    return unless user && frozen_koi_amount

    errors.add(:base, "You don't have enough koi for this grant") if user.koi < frozen_koi_amount
  end
end
