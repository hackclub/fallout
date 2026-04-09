class FixHcbGrantCardLockColumns < ActiveRecord::Migration[8.1]
  def change
    # HCB API returns merchant_lock and category_lock as arrays of strings, not booleans
    remove_column :hcb_grant_cards, :merchant_lock, :boolean, default: false, null: false
    remove_column :hcb_grant_cards, :category_lock, :boolean, default: false, null: false
    add_column :hcb_grant_cards, :merchant_lock, :string, array: true, default: [], null: false
    add_column :hcb_grant_cards, :category_lock, :string, array: true, default: [], null: false
  end
end
