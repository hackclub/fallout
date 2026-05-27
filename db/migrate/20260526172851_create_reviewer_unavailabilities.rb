class CreateReviewerUnavailabilities < ActiveRecord::Migration[8.1]
  def change
    create_table :reviewer_unavailabilities do |t|
      t.references :reviewer, null: false, foreign_key: { to_table: :users }
      t.date :starts_on, null: false
      t.date :ends_on, null: false
      t.string :reason

      t.timestamps
    end
  end
end
