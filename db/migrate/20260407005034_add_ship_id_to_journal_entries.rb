class AddShipIdToJournalEntries < ActiveRecord::Migration[8.1]
  def change
    add_reference :journal_entries, :ship, null: true, foreign_key: true
  end
end
