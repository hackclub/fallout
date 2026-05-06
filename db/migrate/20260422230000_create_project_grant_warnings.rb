class CreateProjectGrantWarnings < ActiveRecord::Migration[8.1]
  def change
    # Surface for any anomaly the financial system detects passively (sync job) or
    # actively (service at topup time). Purely informational — nothing auto-resolves
    # from a warning. The admin (hcb role) reads these and decides how to fix.
    create_table :project_grant_warnings do |t|
      t.string :kind, null: false
      t.text :message, null: false
      t.jsonb :details, default: {}, null: false
      # Subject refs — at least one is typically set so admin can jump to the context.
      t.references :user, foreign_key: true
      t.references :hcb_grant_card, foreign_key: true
      t.references :project_grant_order, foreign_key: true
      t.references :project_funding_topup, foreign_key: true
      # Resolution metadata.
      t.datetime :resolved_at
      t.references :resolved_by, foreign_key: { to_table: :users }
      t.text :resolution_note
      # Dedup: re-detecting the same condition bumps detection_count and last_detected_at
      # on the existing unresolved row instead of spamming new rows.
      t.datetime :last_detected_at, null: false, default: -> { "CURRENT_TIMESTAMP" }
      t.integer :detection_count, null: false, default: 1

      t.timestamps
    end

    add_index :project_grant_warnings, :kind
    add_index :project_grant_warnings, :resolved_at
  end
end
