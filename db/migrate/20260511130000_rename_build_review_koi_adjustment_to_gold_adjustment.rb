class RenameBuildReviewKoiAdjustmentToGoldAdjustment < ActiveRecord::Migration[8.1]
  def change
    rename_column :build_reviews, :koi_adjustment, :gold_adjustment
  end
end
