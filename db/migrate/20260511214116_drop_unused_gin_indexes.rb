class DropUnusedGinIndexes < ActiveRecord::Migration[8.1]
  # CONCURRENTLY can't run inside a DDL transaction.
  disable_ddl_transaction!

  # Drops three GIN/trgm indexes that have 0 scans in prod pg_stat_user_indexes
  # while still being maintained on every write. Removing them frees ~20MB of
  # disk and removes write overhead on these tables (GIN maintenance is notably
  # expensive — particularly on `journal_entries` and `ahoy_events`, which are
  # write-heavy and have no observed read traffic for these indexes).
  #
  # Not dropped: `versions.index_versions_on_object_changes` (22 MB, 563 scans).
  # Some usage exists — likely an admin diff/search view. Revisit separately if
  # that path can use a smaller targeted index.
  def change
    remove_index :journal_entries, name: "index_journal_entries_on_content_trgm",
                 algorithm: :concurrently, if_exists: true
    remove_index :ahoy_events, name: "index_ahoy_events_on_properties",
                 algorithm: :concurrently, if_exists: true
    remove_index :projects, name: "index_projects_on_description_trgm",
                 algorithm: :concurrently, if_exists: true
  end
end
