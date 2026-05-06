class AddCompletedAtToTimeAuditReviews < ActiveRecord::Migration[8.1]
  def change
    add_column :time_audit_reviews, :completed_at, :datetime
    add_index :time_audit_reviews, :completed_at

    # Backfill existing terminal reviews using updated_at as best available approximation.
    # completed_at will be set precisely going forward via the model callback.
    reversible do |dir|
      dir.up do
        execute <<~SQL
          UPDATE time_audit_reviews
          SET completed_at = updated_at
          WHERE status IN (1, 2, 3, 4)
            AND completed_at IS NULL
        SQL
      end
    end
  end
end
