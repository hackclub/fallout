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

# Dev-only seeds
if Rails.env.development?
  # RC reviewer profiles sample data
  reviewer_attrs = [
    { display_name: "Alice Chen",   email: "alice.rc@seed.dev",  roles: %w[requirements_checker] },
    { display_name: "Bob Kim",      email: "bob.rc@seed.dev",    roles: %w[requirements_checker] },
    { display_name: "Carol Wu",     email: "carol.rc@seed.dev",  roles: %w[requirements_checker pass2_reviewer] },
    { display_name: "Dave Torres",  email: "dave.rc@seed.dev",   roles: %w[requirements_checker] }, # zero reviews
  ]

  reviewers = reviewer_attrs.map do |attrs|
    User.find_or_create_by!(email: attrs[:email]) do |u|
      u.display_name = attrs[:display_name]
      u.avatar = "https://api.dicebear.com/9.x/thumbs/svg?seed=#{attrs[:email]}"
      u.timezone = "America/New_York"
      u.hca_id = "seed_rc_#{attrs[:email].split('@').first}"
      u.roles = attrs[:roles]
      u.onboarded = true
    end
  end

  student = User.find_or_create_by!(email: "seed.rc.student@seed.dev") do |u|
    u.display_name = "RC Seed Student"
    u.avatar = "https://api.dicebear.com/9.x/thumbs/svg?seed=rcstudent"
    u.timezone = "America/New_York"
    u.hca_id = "seed_rc_student_001"
    u.roles = []
    u.onboarded = true
  end

  # [reviewer_index, week_offset_from_apr7, count]
  distribution = [
    [ 0, 0, 2 ], [ 0, 1, 5 ], [ 0, 2, 4 ], [ 0, 3, 6 ], [ 0, 4, 3 ],
    [ 1, 0, 3 ], [ 1, 1, 4 ], [ 1, 2, 2 ], [ 1, 3, 5 ], [ 1, 5, 3 ],
    [ 2, 2, 5 ], [ 2, 3, 3 ], [ 2, 4, 6 ],
    # Dave (index 3) intentionally has no reviews
  ]

  rc_reviews = []
  start_date = Date.new(2026, 4, 7)

  distribution.each do |(reviewer_idx, week_offset, count)|
    week_start = start_date + (week_offset * 7)
    next if week_start > Date.today

    count.times do
      project = Project.create!(user: student, name: "RC Seed #{SecureRandom.hex(3)}")
      # status: approved (1) prevents create_initial_reviews! callback (only fires if pending?)
      ship = Ship.create!(project: project, ship_type: 0, status: 1)
      review_time = week_start + rand(0..6).days

      rc_reviews << {
        ship_id: ship.id,
        reviewer_id: reviewers[reviewer_idx].id,
        status: 1, # approved
        lock_version: 0,
        created_at: review_time,
        updated_at: review_time
      }
    end
  end

  RequirementsCheckReview.insert_all!(rc_reviews) if rc_reviews.any?
  puts "Seeded #{rc_reviews.size} RC reviews across #{reviewers.size} reviewers (#{reviewers.last.display_name} has 0)"

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
