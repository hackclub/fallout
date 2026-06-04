class AddExcludedFromReviewerSuggestionsToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :excluded_from_reviewer_suggestions, :boolean, default: false, null: false
  end
end
