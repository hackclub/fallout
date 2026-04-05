# == Schema Information
#
# Table name: shop_items
#
#  id          :bigint           not null, primary key
#  description :text
#  featured    :boolean          default(FALSE), not null
#  image_url   :string
#  name        :string
#  price       :integer
#  status      :string           default("available"), not null
#  ticket      :boolean          default(FALSE), not null
#  created_at  :datetime         not null
#  updated_at  :datetime         not null
#
# Indexes
#
#  index_shop_items_on_status  (status)
#
require "test_helper"

class ShopItemTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
