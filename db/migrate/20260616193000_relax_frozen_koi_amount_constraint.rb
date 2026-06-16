# frozen_string_literal: true

class RelaxFrozenKoiAmountConstraint < ActiveRecord::Migration[8.1]
  def up
    # Koi-first splitting (frozen_gold_amount) makes pure-gold orders valid: a user
    # with 0 koi pays entirely in gold, leaving frozen_koi_amount = 0. The original
    # constraint predates gold and wrongly required koi > 0. Total cost being positive
    # is enforced by ProjectGrantOrder#must_cost_something.
    remove_check_constraint :project_grant_orders, name: "project_grant_orders_frozen_koi_amount_positive"
    add_check_constraint :project_grant_orders, "frozen_koi_amount >= 0", name: "project_grant_orders_frozen_koi_amount_positive"
  end

  def down
    remove_check_constraint :project_grant_orders, name: "project_grant_orders_frozen_koi_amount_positive"
    add_check_constraint :project_grant_orders, "frozen_koi_amount > 0", name: "project_grant_orders_frozen_koi_amount_positive"
  end
end
