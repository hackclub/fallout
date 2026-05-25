# This file should ensure the existence of records required to run the application in every environment (production,
# development, test). The code here should be idempotent so that it can be executed at any point in every environment.
# The data can then be loaded with the bin/rails db:seed command (or created alongside the database with db:setup).

# Shop items
shop_items = [
  {
    name: "Fallout Sticker Pack",
    description: "A set of 5 die-cut Fallout stickers.",
    price: 10,
    currency: "koi",
    image_url: "https://assets.hackclub.com/stickers/blobfish.svg",
    status: "available",
    featured: false,
    ticket: false,
    requires_shipping: true,
    grants_streak_freeze: false
  },
  {
    name: "Streak Freeze",
    description: "Protect your streak for one day.",
    price: 20,
    currency: "koi",
    image_url: "https://assets.hackclub.com/icon-rounded.png",
    status: "available",
    featured: false,
    ticket: false,
    requires_shipping: false,
    grants_streak_freeze: true
  },
  {
    name: "Ticket to Fallout",
    description: "Your invitation to the in-person Fallout event.",
    price: 1,
    currency: "koi",
    image_url: "https://user-cdn.hackclub-assets.com/019d5ed7-69be-7db6-88f9-2062a45e4df1/ticket.webp",
    status: "available",
    featured: true,
    ticket: true,
    requires_shipping: false,
    grants_streak_freeze: false
  }
]

shop_items.each do |attrs|
  ShopItem.find_or_create_by!(name: attrs[:name]) do |item|
    item.assign_attributes(attrs)
  end
end

puts "Seeded #{ShopItem.count} shop items"

# Dev-only: give user 2 a project with 50 approved hours for testing
if Rails.env.development?
  user = User.find_by(id: 2)
  if user
    hours = 50
    seconds = hours * 3600

    project = Project.find_or_create_by!(name: "Seed Test Project", user: user) do |p|
      p.description = "Seeded project for testing approved hours"
      p.manual_seconds = seconds
    end
    project.update!(manual_seconds: seconds)

    ship = Ship.find_or_create_by!(project: project) do |s|
      s.ship_type = :design
      s.status = :approved
      s.approved_public_seconds = seconds
      s.justification = "Seeded for testing"
    end
    ship.update!(status: :approved, approved_public_seconds: seconds)

    puts "Gave user #{user.id} (#{user.display_name}) #{hours} approved hours via project ##{project.id}"
  else
    puts "User 2 not found — skipping approved hours seed"
  end
end
