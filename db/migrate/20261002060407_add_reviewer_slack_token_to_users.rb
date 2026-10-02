class AddReviewerSlackTokenToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :reviewer_slack_token, :text
  end
end
