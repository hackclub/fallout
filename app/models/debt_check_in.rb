# == Schema Information
#
# Table name: debt_check_ins
#
#  id           :bigint           not null, primary key
#  discarded_at :datetime
#  note         :text             not null
#  created_at   :datetime         not null
#  updated_at   :datetime         not null
#  author_id    :bigint           not null
#  user_id      :bigint           not null
#
# Indexes
#
#  index_debt_check_ins_on_author_id               (author_id)
#  index_debt_check_ins_on_discarded_at            (discarded_at)
#  index_debt_check_ins_on_user_id                 (user_id)
#  index_debt_check_ins_on_user_id_and_created_at  (user_id,created_at)
#
# Foreign Keys
#
#  fk_rails_...  (author_id => users.id)
#  fk_rails_...  (user_id => users.id)
#
# An admin's logged check-in on a user who is "in debt" (holds an approved ticket but has
# under their approved-hours threshold). Soft-deleted, not destroyed, so the outreach history
# survives even after a debtor clears their debt.
class DebtCheckIn < ApplicationRecord
  include Discardable

  has_paper_trail

  belongs_to :user # the debtor
  belongs_to :author, class_name: "User" # the admin who recorded the check-in

  validates :note, presence: true, length: { maximum: 2000 }

  scope :newest_first, -> { order(created_at: :desc) }
end
