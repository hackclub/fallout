class AddBackfillClaimColumnsToPhaseTwoReviews < ActiveRecord::Migration[8.1]
  def change
    %i[design_reviews build_reviews].each do |table|
      # Isolated backfill claim: separate from reviewer_id/claim_expires_at so a backfill
      # claim on an approved review never clobbers the original reviewer attribution and
      # never releases (or is released by) a normal pending-review claim.
      add_column table, :backfill_reviewer_id, :bigint
      add_column table, :backfill_claim_expires_at, :datetime
      add_index table, :backfill_reviewer_id
      add_index table, [ :status, :backfill_claim_expires_at ]
      add_foreign_key table, :users, column: :backfill_reviewer_id
    end
  end
end
