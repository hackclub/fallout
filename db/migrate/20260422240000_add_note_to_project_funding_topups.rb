class AddNoteToProjectFundingTopups < ActiveRecord::Migration[8.1]
  def change
    add_column :project_funding_topups, :note, :text
  end
end
