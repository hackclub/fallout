class MakeActorIdNullableOnKoiTransactions < ActiveRecord::Migration[8.1]
  def change
    change_column_null :koi_transactions, :actor_id, true
  end
end
