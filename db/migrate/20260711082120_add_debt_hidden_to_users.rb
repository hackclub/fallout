class AddDebtHiddenToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :debt_hidden_at, :datetime
    add_reference :users, :debt_hidden_by, null: true, foreign_key: { to_table: :users }
  end
end
