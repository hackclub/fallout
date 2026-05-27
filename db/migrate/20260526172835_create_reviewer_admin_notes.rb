class CreateReviewerAdminNotes < ActiveRecord::Migration[8.1]
  def change
    create_table :reviewer_admin_notes do |t|
      t.references :reviewer, null: false, foreign_key: { to_table: :users }
      t.references :author, null: false, foreign_key: { to_table: :users }
      t.text :body, null: false

      t.timestamps
    end
  end
end
