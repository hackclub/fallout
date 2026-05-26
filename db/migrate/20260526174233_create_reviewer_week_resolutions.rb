class CreateReviewerWeekResolutions < ActiveRecord::Migration[8.1]
  def change
    create_table :reviewer_week_resolutions do |t|
      t.references :reviewer, null: false, foreign_key: { to_table: :users }
      t.date :week_start, null: false
      t.string :reason
      t.references :author, null: false, foreign_key: { to_table: :users }

      t.timestamps
    end
    add_index :reviewer_week_resolutions, [ :reviewer_id, :week_start ], unique: true
  end
end
