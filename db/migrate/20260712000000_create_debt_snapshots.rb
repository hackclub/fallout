class CreateDebtSnapshots < ActiveRecord::Migration[8.1]
  def change
    create_table :debt_snapshots do |t|
      t.references :user, null: false, foreign_key: true # the ticket-holder this frozen approved-hours figure belongs to
      t.datetime :cutoff_at, null: false # the immutable point-in-time the approved state was reconstructed at
      t.integer :approved_seconds, null: false, default: 0 # TA-approved seconds attributed to the user as of cutoff_at
      t.jsonb :approved_seconds_by_project, null: false, default: {} # { project_id => seconds } for the per-project drill-down
      t.datetime :computed_at, null: false # when this snapshot row was last (re)built, for auditability

      t.timestamps
    end

    # The debt roster looks up one row per (user, cutoff); enforce that shape and cover the lookup.
    add_index :debt_snapshots, [ :user_id, :cutoff_at ], unique: true
    add_index :debt_snapshots, :cutoff_at
  end
end
