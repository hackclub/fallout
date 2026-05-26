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

# Dev-only: RC reviewer profiles sample data
if Rails.env.development?
  seed_start = Date.new(2026, 1, 5) # First Monday of 2026

  reviewer_data = [
    { display_name: "Alicen Chen",     email: "seed_alice@example.com",  roles: %w[requirements_checker] },
    { display_name: "Bob Kim",         email: "seed_bob@example.com",    roles: %w[requirements_checker pass2_reviewer] },
    { display_name: "Carol Wu",        email: "seed_carol@example.com",  roles: %w[pass2_reviewer] },
    { display_name: "Dave Torres",     email: "seed_dave@example.com",   roles: %w[requirements_checker] }, # intentionally zero reviews
    { display_name: "Eve Nakamura",    email: "seed_eve@example.com",    roles: %w[requirements_checker] },
    { display_name: "Frank Rodriguez", email: "seed_frank@example.com",  roles: %w[pass2_reviewer] }        # recently onboarded
  ]

  non_reviewer_data = [
    { display_name: "Emma Park",    email: "seed_emma@example.com",   slack_id: "USEED0001" },
    { display_name: "Finn Okafor",  email: "seed_finn@example.com",   slack_id: "USEED0002" },
    { display_name: "Grace Liu",    email: "seed_grace@example.com",  slack_id: "USEED0003" },
    { display_name: "Hiro Tanaka",  email: "seed_hiro@example.com",   slack_id: "USEED0004" },
    { display_name: "Isla Ferreira", email: "seed_isla@example.com",  slack_id: "USEED0005" },
    { display_name: "Joon Park",    email: "seed_joon@example.com",   slack_id: "USEED0006" }
  ]

  all_seed_users = reviewer_data +
    non_reviewer_data.map { |u| u.slice(:display_name, :email).merge(roles: []) } +
    [ { display_name: "Seed Student", email: "seed_student@example.com", roles: [] } ]

  all_seed_users.each do |attrs|
    next if User.exists?(email: attrs[:email])
    User.insert_all!([{
      display_name: attrs[:display_name],
      email:        attrs[:email],
      roles:        attrs[:roles],
      avatar:       "https://api.dicebear.com/9.x/identicon/svg?seed=#{attrs[:email]}",
      timezone:     "UTC",
      created_at:   Time.current,
      updated_at:   Time.current
    }])
  end
  reviewer_data.each { |a| User.where(email: a[:email]).update_all(roles: a[:roles]) }
  non_reviewer_data.each { |a| User.where(email: a[:email]).update_all(slack_id: a[:slack_id], roles: []) }

  reviewers = reviewer_data.map { |a| User.find_by!(email: a[:email]) }
  student   = User.find_by!(email: "seed_student@example.com")

  # Weekly review counts per reviewer.
  # week 0 = Jan 5 2026, week 1 = Jan 12, …
  # Omitting a week means 0 reviews (vacation / not yet onboarded).
  # Alice and Bob started week 0 (experienced); Carol onboarded week 8 (mid-program);
  # Eve onboarded week 3; Frank onboarded week 17 (very recent). Dave has zero reviews.
  distributions = {
    reviewers[0].id => [ # Alice — experienced, vacation weeks 6-7
      [0,18],[1,22],[2,20],[3,17],[4,25],[5,19],
      [8,21],[9,23],[10,18],[11,20],[12,15],[13,22],
      [14,19],[15,17],[16,20],[17,16],[18,22],[19,18],[20,3]
    ],
    reviewers[1].id => [ # Bob — very productive, no vacations
      [0,24],[1,28],[2,22],[3,26],[4,30],[5,25],[6,27],[7,23],
      [8,28],[9,25],[10,22],[11,28],[12,24],[13,26],[14,20],
      [15,25],[16,28],[17,22],[18,26],[19,24],[20,4]
    ],
    reviewers[2].id => [ # Carol — onboarded week 8, low start, ramped up
      [8,9],[9,11],[10,16],[11,18],[12,15],[13,20],[14,17],
      [15,19],[16,22],[17,18],[18,20],[19,16],[20,3]
    ],
    # Dave (reviewers[3]) — zero reviews, intentionally omitted
    reviewers[4].id => [ # Eve — onboarded week 3, first week low, vacation week 7
      [3,11],[4,18],[5,20],[6,16],
      [8,22],[9,18],[10,15],[11,20],[12,17],[13,22],[14,18],
      [15,16],[16,20],[17,15],[18,18],[19,17],[20,2]
    ],
    reviewers[5].id => [ # Frank — onboarded week 17, very recent, all weeks low so far
      [17,9],[18,14],[19,11],[20,1]
    ]
  }

  # Wipe existing seed RC/DR data so re-runs are clean
  seed_project_ids = Project.where(user: student, description: "seed-rc").pluck(:id)
  if seed_project_ids.any?
    seed_ship_ids = Ship.where(project_id: seed_project_ids).pluck(:id)
    DesignReview.where(ship_id: seed_ship_ids).delete_all
    RequirementsCheckReview.where(ship_id: seed_ship_ids).delete_all
    Ship.where(id: seed_ship_ids).delete_all
    Project.where(id: seed_project_ids).delete_all
  end

  # Build individual specs: [{reviewer_id:, ts:}, ...]
  specs = []
  distributions.each do |reviewer_id, weeks|
    weeks.each do |week_offset, count|
      ts = (seed_start + (week_offset * 7).days + 3.days).to_time
      count.times { specs << { reviewer_id: reviewer_id, ts: ts } }
    end
  end

  # Bulk-insert projects → ships → reviews in three queries
  now = Time.current
  project_rows = specs.map.with_index { |s, i|
    { name: "Seed RC #{i}", description: "seed-rc", user_id: student.id, created_at: s[:ts], updated_at: s[:ts] }
  }
  project_ids = Project.insert_all!(project_rows, returning: :id).map { |r| r["id"] }

  ship_rows = specs.each_with_index.map { |s, i|
    { project_id: project_ids[i], ship_type: 0, status: 1, justification: "seed",
      created_at: s[:ts], updated_at: s[:ts] }
  }
  ship_ids = Ship.insert_all!(ship_rows, returning: :id).map { |r| r["id"] }

  review_rows = specs.each_with_index.map { |s, i|
    { ship_id: ship_ids[i], reviewer_id: s[:reviewer_id],
      status: RequirementsCheckReview.statuses[:approved],
      created_at: s[:ts], updated_at: s[:ts] }
  }
  RequirementsCheckReview.insert_all!(review_rows)

  # Design reviews for ~65% of ships, timestamped a few days after the RC review.
  # Status weights: approved 70%, returned 20%, rejected 10%.
  dr_statuses = [ 1, 1, 1, 1, 1, 1, 1, 2, 2, 3 ]
  active_reviewers = reviewers.reject { |r| r.email == "seed_dave@example.com" }
  rng = Random.new(42) # fixed seed for deterministic output

  dr_rows = specs.each_with_index.filter_map do |s, i|
    next unless rng.rand < 0.65
    dr_ts = s[:ts] + rng.rand(2..6).days
    reviewer = active_reviewers.sample(random: rng)
    { ship_id: ship_ids[i], reviewer_id: reviewer.id,
      status: dr_statuses.sample(random: rng),
      created_at: dr_ts, updated_at: dr_ts }
  end

  # 3 pending design reviews (no reviewer assigned yet)
  pending_ship_ids = ship_ids.reject { |id| dr_rows.any? { |r| r[:ship_id] == id } }.first(3)
  pending_dr_rows = pending_ship_ids.map { |sid|
    { ship_id: sid, reviewer_id: nil, status: DesignReview.statuses[:pending],
      created_at: Time.current, updated_at: Time.current }
  }
  DesignReview.insert_all!(dr_rows + pending_dr_rows)

  total = specs.size
  puts "Seeded #{total} RC reviews and #{dr_rows.size + pending_dr_rows.size} design reviews (#{pending_dr_rows.size} pending) across #{reviewer_data.size} reviewers (#{reviewer_data.map { |r| r[:display_name] }.join(', ')})"

  # Non-reviewer channel members (shown when SLACK_BOT_TOKEN is blank)
  non_reviewer_data.each do |attrs|
    next if User.exists?(email: attrs[:email])
    User.insert_all!([{
      display_name: attrs[:display_name],
      email:        attrs[:email],
      slack_id:     attrs[:slack_id],
      roles:        [],
      avatar:       "https://api.dicebear.com/9.x/identicon/svg?seed=#{attrs[:email]}",
      timezone:     "UTC",
      created_at:   Time.current,
      updated_at:   Time.current
    }])
  end
  non_reviewer_data.each { |a| User.where(email: a[:email]).update_all(slack_id: a[:slack_id], roles: []) }

  puts "Seeded non-reviewer channel members: #{non_reviewer_data.map { |r| r[:display_name] }.join(', ')}"
end

# Dev-only: design review test data on Tanishq's Test Project
if Rails.env.development?
  tanishq = User.find_by(id: 1)
  project  = tanishq && Project.find_by(name: "Test Project", user: tanishq)

  if project
    seed_rc = User.find_by(email: "seed_alice@example.com")

    # [ship_id_or_nil, rc_status, rc_feedback, dr_status, dr_reviewer_email, dr_feedback]
    # nil ship_id → create a new ship; existing id → add DR to it
    test_cases = [
      { ship_id: 7, dr_status: :pending, dr_reviewer: nil },
      { ship_id: nil, rc_status: :approved, rc_feedback: "All requirements met. Justification is clear and hours are well documented.", dr_status: :pending, dr_reviewer: nil },
      { ship_id: nil, rc_status: :approved, rc_feedback: "Hours verified. Project scope is appropriate and engineering process is documented.", dr_status: :approved, dr_reviewer: "seed_bob@example.com", feedback: "Great work! The design is clean and well thought out. Approved." },
      { ship_id: nil, rc_status: :approved, rc_feedback: "Requirements check passed. Good justification and sufficient hours logged.", dr_status: :returned, dr_reviewer: "seed_carol@example.com", feedback: "Please add more detail to the process section and include screenshots of the final UI before resubmitting." },
    ]

    test_cases.each do |tc|
      ship = if tc[:ship_id]
        Ship.find(tc[:ship_id])
      else
        # status :approved skips the create_initial_reviews! callback
        s_id = Ship.insert_all!(
          [{ project_id: project.id, ship_type: 0, status: 1, justification: "seed DR test",
             created_at: Time.current, updated_at: Time.current }],
          returning: :id
        ).first["id"]
        # Approved RC review — insert_all! skips recompute_ship_status! callback
        RequirementsCheckReview.insert_all!([{
          ship_id: s_id, reviewer_id: seed_rc&.id,
          status: RequirementsCheckReview.statuses[:approved],
          feedback: tc[:rc_feedback],
          created_at: Time.current, updated_at: Time.current
        }])
        Ship.find(s_id)
      end

      next if DesignReview.exists?(ship: ship)

      reviewer_id = tc[:dr_reviewer] ? User.find_by(email: tc[:dr_reviewer])&.id : nil
      # insert_all! bypasses recompute_ship_status! callback
      DesignReview.insert_all!([{
        ship_id: ship.id, reviewer_id: reviewer_id,
        status:   DesignReview.statuses[tc[:dr_status]],
        feedback: tc[:feedback],
        created_at: Time.current, updated_at: Time.current
      }])
    end

    # Backfill RC feedback for any approved RC reviews on this project that have nil feedback
    project_ship_ids = project.ships.pluck(:id)
    RequirementsCheckReview
      .where(ship_id: project_ship_ids, status: RequirementsCheckReview.statuses[:approved], feedback: nil)
      .update_all(feedback: "Requirements verified. All hours and project scope look good. Approved.")

    puts "Seeded design review test cases on '#{project.name}' (user #{tanishq.id})"
  else
    puts "Tanishq / Test Project not found — skipping DR test seed"
  end
end

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
