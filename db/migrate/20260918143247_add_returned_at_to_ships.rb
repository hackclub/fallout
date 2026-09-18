class AddReturnedAtToShips < ActiveRecord::Migration[8.1]
  def up
    add_column :ships, :returned_at, :datetime

    # Backfill from the PaperTrail version that recorded the transition into :returned (status 2),
    # falling back to updated_at — terminal statuses can't transition again (see #status_transition_allowed),
    # so updated_at is the return instant for any ship whose version history was trimmed.
    execute <<~SQL.squish
      UPDATE ships
      SET returned_at = COALESCE(
        (SELECT MIN(versions.created_at)
         FROM versions
         WHERE versions.item_type = 'Ship'
           AND versions.item_id = ships.id
           AND versions.object_changes -> 'status' ->> 1 = '2'),
        ships.updated_at
      )
      WHERE ships.status = 2
    SQL
  end

  def down
    remove_column :ships, :returned_at
  end
end
