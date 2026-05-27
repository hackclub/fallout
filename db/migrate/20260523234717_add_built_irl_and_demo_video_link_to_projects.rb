class AddBuiltIrlAndDemoVideoLinkToProjects < ActiveRecord::Migration[8.1]
  def change
    add_column :projects, :built_irl, :boolean, default: false, null: false
    add_column :projects, :demo_video_link, :string
  end
end
