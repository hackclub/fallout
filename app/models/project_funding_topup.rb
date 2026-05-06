# frozen_string_literal: true

# == Schema Information
#
# Table name: project_funding_topups
#
#  id                     :bigint           not null, primary key
#  amount_cents           :integer          not null
#  completed_at           :datetime
#  counts_toward_funding  :boolean          default(TRUE), not null
#  direction              :string           default("in"), not null
#  discarded_at           :datetime
#  failed_reason          :string
#  note                   :text
#  status                 :string           default("pending"), not null
#  created_at             :datetime         not null
#  updated_at             :datetime         not null
#  hcb_grant_card_id      :bigint           not null
#  project_grant_order_id :bigint
#  user_id                :bigint           not null
#
# Indexes
#
#  index_project_funding_topups_on_counts_toward_funding   (counts_toward_funding)
#  index_project_funding_topups_on_direction               (direction)
#  index_project_funding_topups_on_discarded_at            (discarded_at)
#  index_project_funding_topups_on_hcb_grant_card_id       (hcb_grant_card_id)
#  index_project_funding_topups_on_pending_per_user        (user_id) UNIQUE WHERE (((status)::text = 'pending'::text) AND (discarded_at IS NULL))
#  index_project_funding_topups_on_project_grant_order_id  (project_grant_order_id)
#  index_project_funding_topups_on_status                  (status)
#  index_project_funding_topups_on_user_id                 (user_id)
#
# Foreign Keys
#
#  fk_rails_...  (hcb_grant_card_id => hcb_grant_cards.id)
#  fk_rails_...  (project_grant_order_id => project_grant_orders.id)
#  fk_rails_...  (user_id => users.id)
#
class ProjectFundingTopup < ApplicationRecord
  include Discardable

  STATUSES = %w[pending completed failed].freeze
  DIRECTIONS = %w[in out].freeze

  has_paper_trail
  belongs_to :user
  belongs_to :hcb_grant_card
  belongs_to :project_grant_order, optional: true

  enum :status, { pending: "pending", completed: "completed", failed: "failed" }, default: "pending"
  # Explicit attribute type so the enum declaration doesn't depend on schema_cache
  # being hot — Rails 8 raises "Undeclared attribute type" at class-load time if the
  # cache hasn't seen the column yet (e.g. right after a migration, before a restart).
  attribute :direction, :string
  # `in` = Fallout-initiated topup into the user's grant card (the normal settle path).
  # `out` = admin-recorded refund after they manually withdrew funds on HCB. Ledger-only,
  #         no HCB API call from our side — see Admin::ProjectGrants::OrdersController#refund.
  enum :direction, { in: "in", out: "out" }, default: "in", prefix: true

  validates :amount_cents, presence: true, numericality: { greater_than: 0, only_integer: true }
  validates :status, inclusion: { in: STATUSES }
  validates :direction, inclusion: { in: DIRECTIONS }
  # `out` rows are only ever admin-recorded adjustments that reflect an already-completed
  # HCB action (manual withdrawal, invoice collection). They don't go through the outbox —
  # they are terminal from creation. Explicitly forbidding out/pending and out/failed
  # codifies that invariant so a future code path can't accidentally create a half-state.
  validate :out_rows_must_be_completed
  # Money attribution safety — a topup must reference a card and (optional) order that
  # both belong to the topup's user. Prevents an admin fat-finger from booking money to
  # the wrong user.
  validate :hcb_grant_card_belongs_to_user
  validate :project_grant_order_belongs_to_user

  # Ledger rows are immutable once they leave `pending` — completed rows are real
  # money movement that must never change, and failed rows are a permanent record
  # that a pending was abandoned. Only pending rows are mutable, to allow the
  # service to flip them to completed and the reconciliation UI to flip them to
  # completed or failed.
  #
  # We check `status_was`, not `status` — during an `update!(status: :completed, ...)`
  # call the in-memory attribute is already set but the *_was snapshot still reflects
  # pre-save state. So a pending→completed or pending→failed save passes through;
  # any subsequent edit finds `status_was` non-pending and is blocked.
  def readonly?
    persisted? && status_was.present? && status_was != "pending"
  end

  def destroy
    raise ActiveRecord::ReadOnlyRecord, "ProjectFundingTopup cannot be destroyed; use #discard where allowed"
  end

  def discard
    raise ActiveRecord::ReadOnlyRecord, "Resolved topups are immutable; cannot discard" unless pending?

    super
  end

  private

  def out_rows_must_be_completed
    return unless direction_out?
    return if status == "completed"

    errors.add(:status, "out-direction adjustments must be completed (they represent an already-done HCB action)")
  end

  def hcb_grant_card_belongs_to_user
    return unless hcb_grant_card && user
    return if hcb_grant_card.user_id == user_id

    errors.add(:hcb_grant_card, "belongs to a different user — money attribution mismatch")
  end

  def project_grant_order_belongs_to_user
    return unless project_grant_order && user
    return if project_grant_order.user_id == user_id

    errors.add(:project_grant_order, "belongs to a different user — can't attribute ledger entry to an unrelated order")
  end
end
