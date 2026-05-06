class AddCountsTowardFundingToProjectFundingTopups < ActiveRecord::Migration[8.1]
  def change
    # Flag for manual adjustments (and a future-proof option on order-driven rows):
    #   true  → counts against fulfilled-order expected sum (reduces future order
    #            topup sizes). Auto-generated rows from settle_order! live here by
    #            default since the whole point of an order is to issue funding.
    #   false → pure ledger bookkeeping. Reflects HCB activity for the sync check
    #            (`ledger_divergence`) but does NOT offset what future orders send.
    # DB default is true so existing order-driven flows keep behaving the same.
    # Callers that construct a non-issued row (the adjustments form) must set false
    # explicitly.
    add_column :project_funding_topups, :counts_toward_funding, :boolean, default: true, null: false
    add_index :project_funding_topups, :counts_toward_funding
  end
end
