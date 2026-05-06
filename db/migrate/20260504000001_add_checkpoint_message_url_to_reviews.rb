class AddCheckpointMessageUrlToReviews < ActiveRecord::Migration[8.1]
  def change
    add_column :design_reviews, :checkpoint_message_url, :string
    add_column :requirements_check_reviews, :checkpoint_message_url, :string
  end
end
