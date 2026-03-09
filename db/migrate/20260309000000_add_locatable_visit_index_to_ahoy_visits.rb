class AddLocatableVisitIndexToAhoyVisits < ActiveRecord::Migration[8.0]
  disable_ddl_transaction!

  def change
    add_index :ahoy_visits, [ :user_id, :started_at ],
      where: "country IS NOT NULL AND country != ''",
      order: { started_at: :desc },
      name: "index_ahoy_visits_on_user_locatable",
      algorithm: :concurrently
  end
end
