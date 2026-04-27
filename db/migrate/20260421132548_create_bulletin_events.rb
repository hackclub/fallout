class CreateBulletinEvents < ActiveRecord::Migration[8.1]
  def change
    create_table :bulletin_events do |t|
      t.string :title, null: false
      t.text :description, null: false
      t.string :image_url
      t.boolean :schedulable, null: false, default: true
      t.datetime :starts_at
      t.datetime :ends_at
      t.timestamps
    end

    add_index :bulletin_events, :starts_at
    add_index :bulletin_events, :ends_at
  end
end
