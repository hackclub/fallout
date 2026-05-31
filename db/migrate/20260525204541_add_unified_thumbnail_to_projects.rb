class AddUnifiedThumbnailToProjects < ActiveRecord::Migration[8.1]
  def change
    add_column :projects, :unified_thumbnail_source_url, :string
    add_column :projects, :unified_thumbnail_checked_at, :datetime
  end
end
