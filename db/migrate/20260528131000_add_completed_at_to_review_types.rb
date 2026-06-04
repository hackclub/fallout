class AddCompletedAtToReviewTypes < ActiveRecord::Migration[8.1]
  # approved=1, returned=2, rejected=3, cancelled=4
  TERMINAL_INTS = [ 1, 2, 3, 4 ].freeze

  def change
    add_column :requirements_check_reviews, :completed_at, :datetime
    add_column :design_reviews, :completed_at, :datetime
    add_column :build_reviews, :completed_at, :datetime

    add_index :requirements_check_reviews, :completed_at
    add_index :design_reviews, :completed_at
    add_index :build_reviews, :completed_at

    # Backfill existing terminal reviews — updated_at is the best available proxy
    reversible do |dir|
      dir.up do
        %w[requirements_check_reviews design_reviews build_reviews].each do |table|
          execute <<~SQL
            UPDATE #{table} SET completed_at = updated_at
            WHERE status IN (#{TERMINAL_INTS.join(", ")})
            AND completed_at IS NULL
          SQL
        end
      end
    end
  end
end
