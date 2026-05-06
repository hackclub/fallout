class AddBanReasonToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :ban_reason, :text
  end
end
