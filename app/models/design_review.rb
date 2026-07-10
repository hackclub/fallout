# == Schema Information
#
# Table name: design_reviews
#
#  id                        :bigint           not null, primary key
#  annotations               :jsonb
#  backfill_claim_expires_at :datetime
#  checkpoint_message_url    :string
#  claim_expires_at          :datetime
#  completed_at              :datetime
#  feedback                  :text
#  hours_adjustment          :integer
#  internal_reason           :text
#  koi_adjustment            :integer
#  lock_version              :integer          default(0), not null
#  repo_diff                 :jsonb
#  reviewed_commit_sha       :string
#  status                    :integer          default("pending"), not null
#  created_at                :datetime         not null
#  updated_at                :datetime         not null
#  backfill_reviewer_id      :bigint
#  reviewer_id               :bigint
#  ship_id                   :bigint           not null
#
# Indexes
#
#  index_design_reviews_on_backfill_reviewer_id                  (backfill_reviewer_id)
#  index_design_reviews_on_completed_at                          (completed_at)
#  index_design_reviews_on_reviewer_id                           (reviewer_id)
#  index_design_reviews_on_ship_id                               (ship_id) UNIQUE
#  index_design_reviews_on_status                                (status)
#  index_design_reviews_on_status_and_backfill_claim_expires_at  (status,backfill_claim_expires_at)
#  index_design_reviews_on_status_and_claim_expires_at           (status,claim_expires_at)
#
# Foreign Keys
#
#  fk_rails_...  (backfill_reviewer_id => users.id)
#  fk_rails_...  (reviewer_id => users.id)
#  fk_rails_...  (ship_id => ships.id)
#
class DesignReview < ApplicationRecord
  include Reviewable
  include Backfillable

  def self.review_id_prefix
    "DR"
  end

  # Phase-two repo diff is measured since the last completed phase-two review.
  def self.repo_diff_anchor_classes
    [ DesignReview, BuildReview ]
  end

  def self.extra_review_field_mappings
    {
      "Internal Reason" => :internal_reason,
      "Hours Adjustment" => :hours_adjustment,
      "Currency Adjustment" => :koi_adjustment
    }
  end
end
