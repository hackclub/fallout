class ChangeShipReviewKoiUniquenessToPerUser < ActiveRecord::Migration[8.1]
  def up
    remove_index :koi_transactions, name: "index_koi_transactions_on_ship_review_uniqueness"
    add_index :koi_transactions, %i[ship_id user_id],
              name: "index_koi_transactions_on_ship_review_uniqueness",
              unique: true,
              where: "((reason)::text = 'ship_review'::text) AND (ship_id IS NOT NULL)"
  end

  def down
    remove_index :koi_transactions, name: "index_koi_transactions_on_ship_review_uniqueness"
    add_index :koi_transactions, :ship_id,
              name: "index_koi_transactions_on_ship_review_uniqueness",
              unique: true,
              where: "((reason)::text = 'ship_review'::text) AND (ship_id IS NOT NULL)"
  end
end
