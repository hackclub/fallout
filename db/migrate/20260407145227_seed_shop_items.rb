class SeedShopItems < ActiveRecord::Migration[8.1]
  def up
    ShopItem.create!([
      { name: "Web Cam", description: "Logitech C270", price: 63, image_url: "https://cdn.hackclub.com/019d5b86-266d-7bfc-b711-61b6123eae3e/webcam.webp", status: "unavailable", featured: false, ticket: false },
      { name: "Bench Power Supply", description: "feel the POWERR", price: 126, image_url: "https://cdn.hackclub.com/019d5b53-7f19-702d-9016-b436b91c02ae/psu.webp", status: "unavailable", featured: false, ticket: false },
      { name: "Keycaps", description: "Assorted HC caps!", price: 21, image_url: "", status: "unavailable", featured: false, ticket: false },
      { name: "Fume Extractor", description: "Stop breathing in the fumes!", price: 70, image_url: "https://cdn.hackclub.com/019d5b53-7c2c-7693-8ad0-520d2916db5f/fumeextractor.webp", status: "unavailable", featured: false, ticket: false },
      { name: "Stickers", description: "stick stick stick", price: 10, image_url: "https://cdn.hackclub.com/019d5b4e-f3da-7b50-9312-bd3054ae0fbc/stickers.webp", status: "unavailable", featured: false, ticket: false },
      { name: "Flipper Zero", description: "hack stuff", price: 490, image_url: "https://cdn.hackclub.com/019d5b4e-f690-703e-b380-c13b5196dd54/flipper.webp", status: "unavailable", featured: false, ticket: false },
      { name: "Fallout 4 (the game)", description: "On Steam", price: 28, image_url: "https://cdn.hackclub.com/019d5b4e-ebab-7958-be05-fe74fc728d76/fallout4.webp", status: "unavailable", featured: false, ticket: false },
      { name: "Pinecil", description: "pinecil v2", price: 35, image_url: "https://cdn.hackclub.com/019d5b5c-6919-7b78-bc9f-f9849c2a044b/pinecil.webp", status: "unavailable", featured: false, ticket: false },
      { name: "Renran", description: "hmm", price: 999, image_url: "https://user-cdn.hackclub-assets.com/019d569a-f140-7180-a23c-9c71eb1e7fcd/renran.webp", status: "unavailable", featured: false, ticket: false },
      { name: "Bambu Lab P1S", description: "big printer", price: 560, image_url: "https://cdn.hackclub.com/019d5b4e-e8a2-7917-8d88-6046a18ca31f/p1s.webp", status: "unavailable", featured: false, ticket: false },
      { name: "Bambu Lab A1 Mini", description: "awesome printer", price: 110, image_url: "https://cdn.hackclub.com/019d5b4e-f11e-764b-b860-9e44624edb02/a1mini.webp", status: "unavailable", featured: false, ticket: false },
      { name: "Ticket to Fallout", description: "Visit Shenzhen, China, July 1-7th! Claim at 60 approved hours.", price: 60, image_url: "https://cdn.hackclub.com/019d5ed7-69be-7db6-88f9-2062a45e4df1/ticket.webp", status: "available", featured: true, ticket: true },
      { name: "Travel Grant", description: "$85 (USD) Travel Grant", price: 10, image_url: "https://cdn.hackclub.com/019d5ed7-66ea-7ba6-aa85-4ccde23e31aa/travelgrant.webp", status: "available", featured: true, ticket: false },
      { name: "eSIM Grant", description: "$10 eSIM grant", price: 14, image_url: "https://cdn.hackclub.com/019d6859-efae-7b94-b028-39fc8aa4cd68/airalo.webp", status: "unavailable", featured: false, ticket: false },
    ])
  end

  def down
    ShopItem.where(name: ["Web Cam", "Bench Power Supply", "Keycaps", "Fume Extractor", "Stickers",
                           "Flipper Zero", "Fallout 4 (the game)", "Pinecil", "Renran", "Bambu Lab P1S",
                           "Bambu Lab A1 Mini", "Ticket to Fallout", "Travel Grant", "eSIM Grant"]).destroy_all
  end
end
