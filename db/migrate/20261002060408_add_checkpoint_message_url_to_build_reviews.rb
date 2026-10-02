class AddCheckpointMessageUrlToBuildReviews < ActiveRecord::Migration[8.1]
  def change
    add_column :build_reviews, :checkpoint_message_url, :string
  end
end
