class AddBurnoutDurationSecondsToJournalEntries < ActiveRecord::Migration[8.1]
  def change
    add_column :journal_entries, :burnout_duration_seconds, :integer
  end
end
