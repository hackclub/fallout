class AddProjectGrants < ActiveRecord::Migration[8.1]
  def change
    # Singleton HCB grant config — koi/USD conversion + HCB card lock settings +
    # markdown instructions. All new grant cards get issued with these settings.
    create_table :hcb_grant_settings do |t|
      t.string :purpose
      t.integer :default_expiry_days
      t.string :merchant_lock, array: true, default: [], null: false
      t.string :category_lock, array: true, default: [], null: false
      t.string :keyword_lock
      t.boolean :one_time_use, default: false, null: false
      t.boolean :pre_authorization_required, default: false, null: false
      t.text :instructions
      t.text :invite_message
      t.integer :koi_to_cents_numerator, default: 500, null: false
      t.integer :koi_to_cents_denominator, default: 7, null: false
      t.integer :koi_to_hours_numerator
      t.integer :koi_to_hours_denominator

      t.timestamps
    end

    # User-submitted grant requests. USD amount is user-supplied; koi amount is
    # derived from HcbGrantSetting at order creation and both are frozen.
    create_table :project_grant_orders do |t|
      t.references :user, null: false, foreign_key: true
      t.integer :frozen_koi_amount, null: false
      t.integer :frozen_usd_cents, null: false
      t.string :state, null: false, default: "pending"
      t.text :admin_note
      t.datetime :discarded_at

      t.timestamps
    end

    add_index :project_grant_orders, :state
    add_index :project_grant_orders, :discarded_at
    add_check_constraint :project_grant_orders, "frozen_koi_amount > 0", name: "project_grant_orders_frozen_koi_amount_positive"
    add_check_constraint :project_grant_orders, "frozen_usd_cents > 0", name: "project_grant_orders_frozen_usd_cents_positive"

    # Outbox-style ledger of HCB money movement. A row is inserted BEFORE the HCB
    # call and flipped to completed AFTER — so a dropped response leaves evidence
    # for admin reconciliation instead of silent duplication.
    #
    # `direction`:
    #   "in"  — money moved from Fallout's HCB org INTO the user's grant card
    #           (service-initiated topup / first issuance).
    #   "out" — money moved OUT of the user's grant card (admin manually withdrew
    #           on HCB after a fulfilled order was refunded). Recorded purely as a
    #           ledger entry with status=completed; no HCB API call from Fallout.
    #           Its purpose is to prevent the settle service from seeing a now-gone
    #           transfer and re-topping up.
    create_table :project_funding_topups do |t|
      t.references :user, null: false, foreign_key: true
      t.references :hcb_grant_card, null: false, foreign_key: true
      t.references :project_grant_order, foreign_key: true
      t.integer :amount_cents, null: false
      t.string :direction, null: false, default: "in"
      t.string :status, null: false, default: "pending"
      t.datetime :completed_at
      t.string :failed_reason
      t.datetime :discarded_at

      t.timestamps
    end

    add_index :project_funding_topups, :direction

    add_index :project_funding_topups, :status
    add_index :project_funding_topups, :discarded_at
    add_check_constraint :project_funding_topups, "amount_cents > 0", name: "project_funding_topups_amount_cents_positive"

    # At most one active pending topup per user — prevents the outbox state machine
    # from branching. Partial unique index excludes discarded rows so failed+discarded
    # doesn't block new attempts.
    add_index :project_funding_topups,
      :user_id,
      unique: true,
      where: "status = 'pending' AND discarded_at IS NULL",
      name: "index_project_funding_topups_on_pending_per_user"

    # Extend HcbGrantCard so the issue-time HCB config is captured per card (rather
    # than read back from HcbGrantSetting at render time, which would drift if
    # settings change after issue).
    add_column :hcb_grant_cards, :pre_authorization_required, :boolean, default: false, null: false
    add_column :hcb_grant_cards, :instructions, :text
    add_column :hcb_grant_cards, :invite_message, :text
  end
end
