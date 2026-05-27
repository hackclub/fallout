class CreateFeaturedProjects < ActiveRecord::Migration[8.1]
  def change
    create_table :featured_projects do |t|
      t.references :project, null: false, foreign_key: true
      t.references :featured_by_user, null: false, foreign_key: { to_table: :users }
      t.integer :position, null: false, default: 0
      t.text :note
      t.datetime :featured_at, null: false
      t.datetime :discarded_at

      t.timestamps
    end

    add_index :featured_projects, :position
    add_index :featured_projects, :discarded_at
    # Partial unique index: a project can only be actively featured once at a time,
    # but the same project can appear multiple times across archive history (re-feature flow).
    add_index :featured_projects, :project_id,
              unique: true,
              where: "discarded_at IS NULL",
              name: "index_featured_projects_unique_active_project"
  end
end
