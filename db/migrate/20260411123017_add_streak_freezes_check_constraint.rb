class AddStreakFreezesCheckConstraint < ActiveRecord::Migration[8.1]
  def up
    # Clamp any negative values before adding the constraint
    execute "UPDATE users SET streak_freezes = 0 WHERE streak_freezes < 0"
    add_check_constraint :users, "streak_freezes >= 0", name: "streak_freezes_non_negative"
  end

  def down
    remove_check_constraint :users, name: "streak_freezes_non_negative"
  end
end
