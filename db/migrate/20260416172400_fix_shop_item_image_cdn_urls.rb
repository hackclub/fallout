class FixShopItemImageCdnUrls < ActiveRecord::Migration[8.1]
  def up
    ShopItem.where("image_url LIKE ?", "https://cdn.hackclub.com/%").find_each do |item|
      item.update_columns(image_url: item.image_url.sub("https://cdn.hackclub.com/", "https://user-cdn.hackclub-assets.com/"))
    end
  end

  def down
    ShopItem.where("image_url LIKE ?", "https://user-cdn.hackclub-assets.com/%").find_each do |item|
      item.update_columns(image_url: item.image_url.sub("https://user-cdn.hackclub-assets.com/", "https://cdn.hackclub.com/"))
    end
  end
end
