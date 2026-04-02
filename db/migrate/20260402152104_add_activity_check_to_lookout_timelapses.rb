class AddActivityCheckToLookoutTimelapses < ActiveRecord::Migration[8.1]
  def change
    add_column :lookout_timelapses, :inactive_frame_count, :integer
    add_column :lookout_timelapses, :inactive_percentage, :float
    add_column :lookout_timelapses, :inactive_segments, :jsonb, default: []
    add_column :lookout_timelapses, :activity_checked_at, :datetime
  end
end
