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
#  user_id     :bigint           not null
#
# Indexes
#
#  index_gold_transactions_on_actor_id                (actor_id)
#  index_gold_transactions_on_user_id                 (user_id)
#  index_gold_transactions_on_user_id_and_created_at  (user_id,created_at)
#
# Foreign Keys
#
#  fk_rails_...  (actor_id => users.id)
#  fk_rails_...  (user_id => users.id)
#
class GoldTransaction < ApplicationRecord
  REASONS = %w[admin_adjustment].freeze

  belongs_to :user
  belongs_to :actor, class_name: "User", optional: true # nil for system-generated awards

  validates :amount, presence: true, numericality: { other_than: 0 }
  validates :reason, inclusion: { in: REASONS }
  validates :description, presence: true

  # Prevent accidental mutation — these records are the canonical history
  before_update { raise ActiveRecord::ReadonlyRecord }
  before_destroy { raise ActiveRecord::ReadonlyRecord }

  after_create :increment_user_gold_balance

  private

  def increment_user_gold_balance
    User.update_counters(user_id, gold_balance: amount)
  end
end
