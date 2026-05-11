class AddPartialUniqueIndexesForGoldAndConversion < ActiveRecord::Migration[8.1]
  def change
    # Per-member uniqueness, mirroring koi_transactions' ship_review index.
    # Each project member receives their own ship_review / built_irl_conversion row.
    add_index :gold_transactions, %i[ship_id user_id],
              name: "index_gold_transactions_on_ship_review_uniqueness",
              unique: true,
              where: "((reason)::text = 'ship_review'::text) AND (ship_id IS NOT NULL)"

    add_index :gold_transactions, %i[ship_id user_id],
              name: "index_gold_transactions_on_built_irl_conversion_uniqueness",
              unique: true,
              where: "((reason)::text = 'built_irl_conversion'::text) AND (ship_id IS NOT NULL)"

    add_index :koi_transactions, %i[ship_id user_id],
              name: "index_koi_transactions_on_built_irl_conversion_uniqueness",
              unique: true,
              where: "((reason)::text = 'built_irl_conversion'::text) AND (ship_id IS NOT NULL)"
  end
end
