class CreateUsers < ActiveRecord::Migration[8.0]
  def change
    create_table :users do |t|
      t.string :avatar, null: false
      t.string :slack_id, null: false
      t.string :display_name, null: false
      t.string :timezone, null: false
      t.string :first_name, null: false
      t.string :last_name, null: false
      t.integer :role, null: false, default: 0
      t.boolean :is_banned, null: false, default: false

      t.timestamps null: false
    end
  end
end
