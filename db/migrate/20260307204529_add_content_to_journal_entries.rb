class AddContentToJournalEntries < ActiveRecord::Migration[8.1]
  def change
    add_column :journal_entries, :content, :text
  end
end
