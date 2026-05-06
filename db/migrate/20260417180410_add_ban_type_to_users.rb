class AddBanTypeToUsers < ActiveRecord::Migration[8.1]
  def up
    add_column :users, :ban_type, :string
    # Backfill legacy bans with 'fallout' so UserBanCheckJob treats them as manually-set
    # and does not auto-unban them (nil ban_type would fall into the auto-unban branch).
    execute("UPDATE users SET ban_type = 'fallout' WHERE is_banned = TRUE")
  end

  def down
    remove_column :users, :ban_type
  end
end
