# == Schema Information
#
# Table name: gold_transactions
#
#  id          :bigint           not null, primary key
#  amount      :integer          not null
#  description :text             not null
#  reason      :string           not null
#  created_at  :datetime         not null
#  updated_at  :datetime         not null
#  actor_id    :bigint
#  ship_id     :bigint
#  transfer_id :uuid
#  user_id     :bigint           not null
#
# Indexes
#
#  index_gold_transactions_on_actor_id                         (actor_id)
#  index_gold_transactions_on_built_irl_conversion_uniqueness  (ship_id,user_id) UNIQUE WHERE (((reason)::text = 'built_irl_conversion'::text) AND (ship_id IS NOT NULL))
#  index_gold_transactions_on_ship_id                          (ship_id)
#  index_gold_transactions_on_ship_review_uniqueness           (ship_id,user_id) UNIQUE WHERE (((reason)::text = 'ship_review'::text) AND (ship_id IS NOT NULL))
#  index_gold_transactions_on_transfer_id                      (transfer_id) WHERE (transfer_id IS NOT NULL)
#  index_gold_transactions_on_user_id                          (user_id)
#  index_gold_transactions_on_user_id_and_created_at           (user_id,created_at)
#
# Foreign Keys
#
#  fk_rails_...  (actor_id => users.id)
#  fk_rails_...  (ship_id => ships.id)
#  fk_rails_...  (user_id => users.id)
#
class GoldTransaction < ApplicationRecord
  # Reasons that require a ship_id (DB-enforced via partial unique indexes)
  SHIP_REASONS = %w[ship_review built_irl_conversion].freeze
  REASONS = (SHIP_REASONS + %w[admin_adjustment]).freeze

  belongs_to :user
  belongs_to :actor, class_name: "User", optional: true # nil for system-generated awards
  belongs_to :ship, optional: true # set iff reason ∈ SHIP_REASONS (see ship_id_consistency)

  validates :amount, presence: true, numericality: { other_than: 0 }
  validates :reason, inclusion: { in: REASONS }
  validates :description, presence: true
  validate :ship_id_consistency

  # Prevent accidental mutation — these records are the canonical history
  before_update { raise ActiveRecord::ReadonlyRecord }
  before_destroy { raise ActiveRecord::ReadonlyRecord }

  after_create :increment_user_gold_balance

  private

  def increment_user_gold_balance
    User.update_counters(user_id, gold_balance: amount)
  end

  # Enforces the structural contract `ship_id present iff reason ∈ SHIP_REASONS`.
  def ship_id_consistency
    requires_ship = SHIP_REASONS.include?(reason)
    if requires_ship && ship_id.blank?
      errors.add(:ship_id, "is required for #{reason} transactions")
    elsif !requires_ship && ship_id.present?
      errors.add(:ship_id, "is only allowed for #{SHIP_REASONS.join(' / ')} transactions")
    end
  end
end
