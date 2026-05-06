# == Schema Information
#
# Table name: koi_transactions
#
#  id          :bigint           not null, primary key
#  amount      :integer          not null
#  description :text             not null
#  reason      :string           not null
#  created_at  :datetime         not null
#  actor_id    :bigint
#  ship_id     :bigint
#  user_id     :bigint           not null
#
# Indexes
#
#  index_koi_transactions_on_actor_id                (actor_id)
#  index_koi_transactions_on_ship_review_uniqueness  (ship_id) UNIQUE WHERE (((reason)::text = 'ship_review'::text) AND (ship_id IS NOT NULL))
#  index_koi_transactions_on_user_id                 (user_id)
#  index_koi_transactions_on_user_id_and_created_at  (user_id,created_at)
#
# Foreign Keys
#
#  fk_rails_...  (actor_id => users.id)
#  fk_rails_...  (ship_id => ships.id)
#  fk_rails_...  (user_id => users.id)
#
class KoiTransaction < ApplicationRecord
  REASONS = %w[ship_review admin_adjustment streak_goal].freeze

  belongs_to :user
  belongs_to :actor, class_name: "User", optional: true # nil for system-generated awards (e.g. streak goals)
  belongs_to :ship, optional: true # set iff reason == "ship_review" (see ship_id_consistency)

  validates :amount, presence: true, numericality: { other_than: 0 }
  validates :reason, inclusion: { in: REASONS }
  validates :description, presence: true
  validate :ship_id_consistency

  # Prevent accidental mutation — these records are the canonical history
  before_update { raise ActiveRecord::ReadonlyRecord }
  before_destroy { raise ActiveRecord::ReadonlyRecord }

  private

  # Enforces the structural contract `reason == "ship_review" iff ship_id present`.
  # Belt-and-suspenders alongside the partial unique index in
  # 20260427132327_add_ship_to_koi_transactions; the index guarantees uniqueness
  # but this validation guards against malformed inserts (wrong reason, stray ship_id).
  def ship_id_consistency
    if reason == "ship_review" && ship_id.blank?
      errors.add(:ship_id, "is required for ship_review transactions")
    elsif reason != "ship_review" && ship_id.present?
      errors.add(:ship_id, "is only allowed for ship_review transactions")
    end
  end
end
