# == Schema Information
#
# Table name: build_reviews
#
#  id               :bigint           not null, primary key
#  annotations      :jsonb
#  claim_expires_at :datetime
#  feedback         :text
#  hours_adjustment :integer
#  internal_reason  :text
#  koi_adjustment   :integer
#  lock_version     :integer          default(0), not null
#  status           :integer          default("pending"), not null
#  created_at       :datetime         not null
#  updated_at       :datetime         not null
#  reviewer_id      :bigint
#  ship_id          :bigint           not null
#
# Indexes
#
#  index_build_reviews_on_reviewer_id                  (reviewer_id)
#  index_build_reviews_on_ship_id                      (ship_id) UNIQUE
#  index_build_reviews_on_status                       (status)
#  index_build_reviews_on_status_and_claim_expires_at  (status,claim_expires_at)
#
# Foreign Keys
#
#  fk_rails_...  (reviewer_id => users.id)
#  fk_rails_...  (ship_id => ships.id)
#
class BuildReview < ApplicationRecord
  include Reviewable

  def self.review_id_prefix
    "BR"
  end

  def self.extra_review_field_mappings
    {
      "Internal Reason" => :internal_reason,
      "Hours Adjustment" => :hours_adjustment,
      "Koi Adjustment" => :koi_adjustment
    }
  end
end
