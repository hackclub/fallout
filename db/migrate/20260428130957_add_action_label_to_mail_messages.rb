class AddActionLabelToMailMessages < ActiveRecord::Migration[8.1]
  def change
    add_column :mail_messages, :action_label, :string
  end
end
