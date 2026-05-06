class BackfillTaAnnotationsFromReturnedShips < ActiveRecord::Migration[8.1]
  def up
    # Find pending TAs whose ship has a prior ship with a returned TA that has annotations.
    # Re-run carry_forward_ta_annotations! which now handles returned prev TAs.
    TimeAuditReview.pending.each do |ta|
      ta.ship.send(:carry_forward_ta_annotations!, ta)
    end
  end

  def down
    raise ActiveRecord::IrreversibleMigration
  end
end
