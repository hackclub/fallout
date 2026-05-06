class AddTransactionTypeToHcbTransactions < ActiveRecord::Migration[8.1]
  def change
    # Inferred at sync time from the HCB API payload shape:
    #   - "purchase"    → transaction has a `card_charge` key (student spent on the card)
    #   - "transfer"    → transaction has a `transfer` key (org↔card money movement:
    #                     topups, withdrawals, initial grant issuance, refunds, etc.)
    #   - "other"       → anything unexpected
    # The stats tile counts only purchases — everything else is our own internal ledger activity.
    add_column :hcb_transactions, :transaction_type, :string
    add_index :hcb_transactions, :transaction_type
  end
end
