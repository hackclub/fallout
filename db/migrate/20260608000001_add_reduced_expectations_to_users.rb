class AddReducedExpectationsToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :reduced_expectations, :boolean, default: false, null: false
    add_column :users, :reduced_expectations_reason, :string
    add_column :users, :reduced_expectations_until, :date
    add_column :users, :reduced_expectations_target, :decimal
  end
end
