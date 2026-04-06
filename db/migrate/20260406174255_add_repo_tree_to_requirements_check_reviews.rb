class AddRepoTreeToRequirementsCheckReviews < ActiveRecord::Migration[8.1]
  def change
    add_column :requirements_check_reviews, :repo_tree, :jsonb
  end
end
