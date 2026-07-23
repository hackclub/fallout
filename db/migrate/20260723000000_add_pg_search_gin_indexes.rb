class AddPgSearchGinIndexes < ActiveRecord::Migration[8.1]
  # Expression GIN indexes matching the exact tsvector expressions pg_search
  # generates for each model's `search` scope, so the Meilisearch-down fallback
  # is index-served instead of recomputing to_tsvector over every row.
  def up
    execute <<~SQL
      CREATE INDEX IF NOT EXISTS index_projects_on_search_tsvector ON projects USING gin (
        (to_tsvector('simple', coalesce(name::text, '')) || to_tsvector('simple', coalesce(description::text, '')))
      )
    SQL

    execute <<~SQL
      CREATE INDEX IF NOT EXISTS index_journal_entries_on_search_tsvector ON journal_entries USING gin (
        (to_tsvector('simple', coalesce(content::text, '')))
      )
    SQL

    execute <<~SQL
      CREATE INDEX IF NOT EXISTS index_users_on_search_tsvector ON users USING gin (
        (to_tsvector('simple', coalesce(display_name::text, '')) || to_tsvector('simple', coalesce(email::text, '')))
      )
    SQL
  end

  def down
    execute "DROP INDEX IF EXISTS index_projects_on_search_tsvector"
    execute "DROP INDEX IF EXISTS index_journal_entries_on_search_tsvector"
    execute "DROP INDEX IF EXISTS index_users_on_search_tsvector"
  end
end
