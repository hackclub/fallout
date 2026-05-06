class AddAutoOpenToMailMessages < ActiveRecord::Migration[8.1]
  def change
    add_column :mail_messages, :auto_open, :boolean
  end
end
