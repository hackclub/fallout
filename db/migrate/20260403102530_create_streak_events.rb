class CreateStreakEvents < ActiveRecord::Migration[8.1]
  def change
    create_table :streak_events do |t|
      t.references :user, null: false, foreign_key: true
      t.string :event_type, null: false
      t.jsonb :metadata, null: false, default: {}

      t.timestamps
    end

    add_index :streak_events, [ :user_id, :event_type ]
  end
end
