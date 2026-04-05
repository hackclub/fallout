# == Schema Information
#
# Table name: koi_transactions
#
#  id          :bigint           not null, primary key
#  amount      :integer          not null
#  description :text             not null
#  reason      :string           not null
#  created_at  :datetime         not null
#  actor_id    :bigint           not null
#  user_id     :bigint           not null
#
# Indexes
#
#  index_koi_transactions_on_actor_id                (actor_id)
#  index_koi_transactions_on_user_id                 (user_id)
#  index_koi_transactions_on_user_id_and_created_at  (user_id,created_at)
#
# Foreign Keys
#
#  fk_rails_...  (actor_id => users.id)
#  fk_rails_...  (user_id => users.id)
#
class KoiTransaction < ApplicationRecord
  REASONS = %w[ship_review admin_adjustment].freeze

  belongs_to :user
  belongs_to :actor, class_name: "User"

  validates :amount, presence: true, numericality: { other_than: 0 }
  validates :reason, inclusion: { in: REASONS }
  validates :description, presence: true

  # Prevent accidental mutation — these records are the canonical history
  before_update { raise ActiveRecord::ReadonlyRecord }
  before_destroy { raise ActiveRecord::ReadonlyRecord }
end
