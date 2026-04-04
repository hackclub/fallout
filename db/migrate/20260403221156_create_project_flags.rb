class CreateProjectFlags < ActiveRecord::Migration[8.1]
  def change
    create_table :project_flags do |t|
      t.references :project, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.references :ship, foreign_key: true
      t.string :review_stage
      t.text :reason, null: false

      t.timestamps
    end
  end
end
