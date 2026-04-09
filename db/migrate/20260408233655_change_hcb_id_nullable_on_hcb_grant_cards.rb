class ChangeHcbIdNullableOnHcbGrantCards < ActiveRecord::Migration[8.1]
  def change
    change_column_null :hcb_grant_cards, :hcb_id, true
  end
end
