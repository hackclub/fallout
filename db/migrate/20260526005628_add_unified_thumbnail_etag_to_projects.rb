class AddUnifiedThumbnailEtagToProjects < ActiveRecord::Migration[8.1]
  def change
    add_column :projects, :unified_thumbnail_etag, :string
  end
end
