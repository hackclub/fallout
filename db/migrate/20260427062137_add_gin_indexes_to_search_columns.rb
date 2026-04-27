class AddGinIndexesToSearchColumns < ActiveRecord::Migration[8.1]
  disable_ddl_transaction!

  def change
    enable_extension "pg_trgm"
    add_index :projects, :name, using: :gin,
              opclass: :gin_trgm_ops,
              algorithm: :concurrently,
              name: "index_projects_on_name_trgm"
    add_index :projects, :description, using: :gin,
              opclass: :gin_trgm_ops,
              algorithm: :concurrently,
              name: "index_projects_on_description_trgm"
    add_index :journal_entries, :content, using: :gin,
              opclass: :gin_trgm_ops,
              algorithm: :concurrently,
              name: "index_journal_entries_on_content_trgm"
  end
end
