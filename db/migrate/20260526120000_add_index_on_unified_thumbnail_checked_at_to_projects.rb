class AddIndexOnUnifiedThumbnailCheckedAtToProjects < ActiveRecord::Migration[8.1]
  disable_ddl_transaction!

  def change
    add_index :projects, :unified_thumbnail_checked_at,
              algorithm: :concurrently,
              if_not_exists: true
  end
end
