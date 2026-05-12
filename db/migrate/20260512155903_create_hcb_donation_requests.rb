class CreateHcbDonationRequests < ActiveRecord::Migration[8.1]
  def change
    # User-initiated donation intent. The user clicks Donate, we create a row with a
    # random token + amount, then redirect them to HCB's donation page with the token
    # embedded in the donation `message` field. HcbDonationSyncJob walks the org's
    # revenue transactions, matches by token, and books a `counts_toward_funding: false`
    # ProjectFundingTopup so the donated funds land on the user's card without
    # reducing future project-funding entitlement.
    create_table :hcb_donation_requests do |t|
      t.references :user, null: false, foreign_key: true
      t.string :token, null: false
      t.integer :amount_cents, null: false
      t.string :hcb_donation_id
      t.datetime :donated_at
      t.datetime :matched_at
      t.references :project_funding_topup, foreign_key: true
      t.datetime :refunded_at
      t.datetime :last_seen_at
      t.datetime :discarded_at

      t.timestamps
    end

    add_index :hcb_donation_requests, :token, unique: true
    add_index :hcb_donation_requests, :hcb_donation_id, unique: true, where: "hcb_donation_id IS NOT NULL"
    add_index :hcb_donation_requests, :matched_at
    add_index :hcb_donation_requests, :discarded_at
    add_check_constraint :hcb_donation_requests, "amount_cents > 0", name: "hcb_donation_requests_amount_cents_positive"
  end
end
