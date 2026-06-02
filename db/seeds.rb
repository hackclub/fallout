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

# Dev-only data: clean up junk test rows, then seed curated demo data
if Rails.env.development?
  # Purge legacy test-fixture rows from minitest jobs/models that bypass transactional fixtures
  # (test/models/project_test.rb, test/jobs/compute_project_unified_thumbnail_job_test.rb).
  # Identified by the exact display names the tests hardcode — narrow enough that real users
  # (HCA-authenticated, type=nil) can never match. destroy_all cascades through dependent: :destroy
  # on projects, journal entries, ships, koi_transactions, etc.
  fixture_users = User.where(type: "TrialUser", display_name: [ "Unified Tester", "Project Tester" ])
  purged_count = fixture_users.count
  if purged_count.positive?
    # FeaturedProject's FK to projects is non-cascading by design (we want hard project deletes
    # to be explicit). Clear referencing rows first so the user → project cascade can proceed.
    FeaturedProject.where(project_id: Project.where(user_id: fixture_users.select(:id))).delete_all
    fixture_users.destroy_all
    puts "Purged #{purged_count} legacy test-fixture users (cascaded to their projects)"
  end

  # --- Demo dataset --------------------------------------------------------
  # Heal legacy broken avatars left behind by system specs, then create a
  # curated set of full users + diverse projects + journal entries so the
  # bulletin board / explore feed / admin dashboards have realistic content.
  # Idempotent: re-running only fills gaps. Pictures come from picsum.photos
  # (deterministic seed → stable image across runs).
  require "open-uri"

  PICSUM_AVATAR = ->(seed) { "https://picsum.photos/seed/fallout-user-#{seed}/200/200" }
  PICSUM_THUMB  = ->(seed) { "https://picsum.photos/seed/fallout-proj-#{seed}/800/1000" }
  PICSUM_JOURNAL = ->(seed) { "https://picsum.photos/seed/fallout-journal-#{seed}/900/600" }

  # 1. Fix obviously-broken avatars on existing test/trial users so the UI
  #    stops rendering broken-image icons. update_column skips validations and
  #    callbacks — these are display-only fixes.
  broken_avatar_users = User.where(avatar: [ "https://example.com/a.png", nil, "" ])
  broken_count = broken_avatar_users.count
  broken_avatar_users.find_each do |u|
    u.update_column(:avatar, PICSUM_AVATAR.call(u.id))
  end
  puts "Healed #{broken_count} broken user avatars" if broken_count.positive?

  # 2. Curated demo users — full (non-trial) so they show on the explore feed
  #    and can own featured projects without the trial-account guards.
  demo_people = [
    { display: "Alex Tran",     first: "Alex",   last: "Tran" },
    { display: "Tongyu Zhou",   first: "Tongyu", last: "Zhou" },
    { display: "Cyao Lin",      first: "Cyao",   last: "Lin" },
    { display: "Antush Patel",  first: "Antush", last: "Patel" },
    { display: "Mira Suzuki",   first: "Mira",   last: "Suzuki" },
    { display: "Joon Park",     first: "Joon",   last: "Park" },
    { display: "Sade Okafor",   first: "Sade",   last: "Okafor" },
    { display: "Felix Romero",  first: "Felix",  last: "Romero" }
  ]

  demo_projects = [
    { name: "Biblically Accurate Keyboard",
      description: "A 36-key split keyboard inspired by the wild geometry of biblical seraphim. ZMK firmware, hand-wired matrix, 3D-printed case.",
      repo_link: "https://github.com/fallout-demo/biblical-keyboard",
      tags: %w[hardware keyboard 3d-printing] },
    { name: "Mini Maimai",
      description: "Pocket-sized rhythm cabinet that emulates Sega's maimai. 8 capacitive touch buttons, OLED display, USB-C charging.",
      repo_link: "https://github.com/fallout-demo/mini-maimai",
      tags: %w[hardware arcade rhythm-game] },
    { name: "Icepi Zero",
      description: "Raspberry Pi Zero stuffed inside a translucent Game Boy Pocket shell. Runs RetroArch and a custom launcher in Pygame.",
      repo_link: "https://github.com/fallout-demo/icepi-zero",
      tags: %w[hardware emulation handheld] },
    { name: "Split Wave",
      description: "Open-source ergonomic split keyboard with a tented case and per-key RGB underglow. KiCad designs included.",
      repo_link: "https://github.com/fallout-demo/split-wave",
      tags: %w[keyboard ergonomics kicad] },
    { name: "RainPi Weather Station",
      description: "ESP32-driven weather rig with BME280 + tipping bucket rain gauge, piping live data into a self-hosted Grafana board.",
      repo_link: "https://github.com/fallout-demo/rainpi",
      tags: %w[iot esp32 grafana] },
    { name: "Glow Pen",
      description: "Smart-pen prototype with a capacitive ink sensor and an addressable LED ferrule. Pairs over BLE to a sketch app.",
      repo_link: "https://github.com/fallout-demo/glow-pen",
      tags: %w[hardware ble wearable] },
    { name: "Loopback Drum Pad",
      description: "Hand-machined aluminum drum pads driving a CME-pitched groovebox over MIDI. Built around a Teensy 4.1.",
      repo_link: "https://github.com/fallout-demo/loopback-pad",
      tags: %w[music midi teensy] },
    { name: "Tiny Telescope",
      description: "DIY equatorial tracking mount with a stepper-driven RA axis. STM32 controller, hand-cut aluminum, 3D-printed gears.",
      repo_link: "https://github.com/fallout-demo/tiny-telescope",
      tags: %w[astronomy hardware stm32] }
  ]

  journal_templates = [
    "Kicked off the project today — sketched the rough enclosure on paper and ordered the first batch of parts.",
    "Got the bare-bones firmware compiling. Pushed an initial commit; mostly just I/O setup and a debug LED blink.",
    "Spent the afternoon on the wiring harness. Rerouted everything under the main PCB so the lid finally closes.",
    "Friday demo went well — useful feedback from the cohort. Going to refactor the input handling before the next iteration.",
    "Soldering session #3. Burns: 0. Solder joints: 84. Probably the best ratio yet.",
    "Took the prototype to a coffee shop and let people try it. Big win on the haptics — biggest complaint is the screen brightness.",
    "Long debugging session. Turns out the bus was floating because I forgot a pull-up. Adding it to the BOM so future-me doesn't forget."
  ]

  demo_emails = demo_people.map { |p| "#{p[:display].parameterize}@fallout.demo" }

  demo_people.zip(demo_projects).each_with_index do |(person, proj), index|
    next unless person && proj

    slug = person[:display].parameterize
    email = "#{slug}@fallout.demo"

    # Curated full users (type=nil). slack_id/hca_id are required for non-trial accounts.
    user = User.find_or_initialize_by(email: email)
    if user.new_record?
      user.assign_attributes(
        type: nil,
        display_name: person[:display],
        first_name: person[:first],
        last_name: person[:last],
        avatar: PICSUM_AVATAR.call(slug),
        timezone: "America/New_York",
        slack_id: "UDEMO#{(1000 + index)}",
        hca_id: "demo-hca-#{slug}",
        onboarded: true,
        is_adult: true,
        roles: %w[user]
      )
      user.save!
    elsif user.avatar.blank? || begin
      host = URI.parse(user.avatar).host&.downcase
      host == "example.com" || host&.end_with?(".example.com")
    rescue URI::InvalidURIError
      false
    end
      user.update!(avatar: PICSUM_AVATAR.call(slug))
    end

    project = Project.find_or_initialize_by(name: proj[:name], user: user)
    if project.new_record?
      project.assign_attributes(
        description: proj[:description],
        repo_link: proj[:repo_link],
        tags: proj[:tags],
        is_unlisted: false
      )
      project.save!
    end

    # Attach a deterministic picsum cover so the bulletin board featured grid
    # and explore feed have real images instead of empty placeholders.
    unless project.unified_thumbnail.attached?
      url = PICSUM_THUMB.call(proj[:name].parameterize)
      begin
        downloaded = URI.parse(url).open(read_timeout: 10)
        project.unified_thumbnail.attach(
          io: downloaded,
          filename: "#{proj[:name].parameterize}.jpg",
          content_type: "image/jpeg"
        )
      rescue => e
        warn "  could not attach thumbnail for #{project.name}: #{e.class}: #{e.message}"
      end
    end

    # Three journal entries per project, each with one picsum image attached so
    # the explore feed cards have inline media variety.
    needed = 3 - project.journal_entries.count
    needed.times do |n|
      entry = JournalEntry.create!(
        user: user,
        project: project,
        content: journal_templates[(index + n) % journal_templates.length]
      )

      begin
        downloaded = URI.parse(PICSUM_JOURNAL.call("#{slug}-#{project.id}-#{n}")).open(read_timeout: 10)
        entry.images.attach(
          io: downloaded,
          filename: "journal-#{entry.id}.jpg",
          content_type: "image/jpeg"
        )
      rescue => e
        warn "  could not attach journal image for entry ##{entry.id}: #{e.class}: #{e.message}"
      end
    end
  end

  demo_user_scope = User.verified.where(email: demo_emails)
  puts "Demo users: #{demo_user_scope.count}"
  puts "Demo projects: #{Project.where(user_id: demo_user_scope.select(:id)).count}"
  puts "Demo journal entries: #{JournalEntry.where(user_id: demo_user_scope.select(:id)).count}"

  # Give the first demo user a separate project with 50 approved hours so the path/hours-stats
  # flows have data to render. Previously this targeted a TrialUser by id, but that user is
  # purged above — anchor it to a curated demo identity instead.
  hours_target = demo_user_scope.order(:id).first
  if hours_target
    hours = 50
    seconds = hours * 3600

    hours_project = Project.find_or_create_by!(name: "Seeded Hours Project", user: hours_target) do |p|
      p.description = "Seeded project for testing approved hours"
      p.manual_seconds = seconds
    end
    hours_project.update!(manual_seconds: seconds)

    hours_ship = Ship.find_or_create_by!(project: hours_project) do |s|
      s.ship_type = :design
      s.status = :approved
      s.approved_public_seconds = seconds
      s.justification = "Seeded for testing"
    end
    hours_ship.update!(status: :approved, approved_public_seconds: seconds)

    puts "Gave #{hours_target.display_name} (##{hours_target.id}) #{hours} approved hours via project ##{hours_project.id}"
  end
end

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
    User.insert_all!([ {
      display_name: attrs[:display_name],
      email:        attrs[:email],
      roles:        attrs[:roles],
      avatar:       "https://api.dicebear.com/9.x/identicon/svg?seed=#{attrs[:email]}",
      timezone:     "UTC",
      created_at:   Time.current,
      updated_at:   Time.current
    } ])
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
      [ 0, 18 ], [ 1, 22 ], [ 2, 20 ], [ 3, 17 ], [ 4, 25 ], [ 5, 19 ],
      [ 8, 21 ], [ 9, 23 ], [ 10, 18 ], [ 11, 20 ], [ 12, 15 ], [ 13, 22 ],
      [ 14, 19 ], [ 15, 17 ], [ 16, 20 ], [ 17, 16 ], [ 18, 22 ], [ 19, 18 ], [ 20, 3 ]
    ],
    reviewers[1].id => [ # Bob — very productive, no vacations
      [ 0, 24 ], [ 1, 28 ], [ 2, 22 ], [ 3, 26 ], [ 4, 30 ], [ 5, 25 ], [ 6, 27 ], [ 7, 23 ],
      [ 8, 28 ], [ 9, 25 ], [ 10, 22 ], [ 11, 28 ], [ 12, 24 ], [ 13, 26 ], [ 14, 20 ],
      [ 15, 25 ], [ 16, 28 ], [ 17, 22 ], [ 18, 26 ], [ 19, 24 ], [ 20, 4 ]
    ],
    reviewers[2].id => [ # Carol — onboarded week 8, low start, ramped up
      [ 8, 9 ], [ 9, 11 ], [ 10, 16 ], [ 11, 18 ], [ 12, 15 ], [ 13, 20 ], [ 14, 17 ],
      [ 15, 19 ], [ 16, 22 ], [ 17, 18 ], [ 18, 20 ], [ 19, 16 ], [ 20, 3 ]
    ],
    # Dave (reviewers[3]) — zero reviews, intentionally omitted
    reviewers[4].id => [ # Eve — onboarded week 3, first week low, vacation week 7
      [ 3, 11 ], [ 4, 18 ], [ 5, 20 ], [ 6, 16 ],
      [ 8, 22 ], [ 9, 18 ], [ 10, 15 ], [ 11, 20 ], [ 12, 17 ], [ 13, 22 ], [ 14, 18 ],
      [ 15, 16 ], [ 16, 20 ], [ 17, 15 ], [ 18, 18 ], [ 19, 17 ], [ 20, 2 ]
    ],
    reviewers[5].id => [ # Frank — onboarded week 17, very recent, all weeks low so far
      [ 17, 9 ], [ 18, 14 ], [ 19, 11 ], [ 20, 1 ]
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

  # 3 pending design reviews (no reviewer assigned yet), with varied TA-approved hours so sort works
  pending_ship_ids = ship_ids.reject { |id| dr_rows.any? { |r| r[:ship_id] == id } }.first(3)
  pending_dr_rows = pending_ship_ids.map { |sid|
    { ship_id: sid, reviewer_id: nil, status: DesignReview.statuses[:pending],
      created_at: Time.current, updated_at: Time.current }
  }
  DesignReview.insert_all!(dr_rows + pending_dr_rows)

  pending_ta_hours = [ 8, 22, 15 ]
  pending_ta_rows = pending_ship_ids.each_with_index.map { |sid, i|
    seconds = pending_ta_hours[i] * 3600
    { ship_id: sid, reviewer_id: reviewers[0].id,
      status: TimeAuditReview.statuses[:approved],
      approved_public_seconds: seconds,
      completed_at: Time.current,
      created_at: Time.current, updated_at: Time.current }
  }
  TimeAuditReview.insert_all!(pending_ta_rows)

  total = specs.size
  puts "Seeded #{total} RC reviews and #{dr_rows.size + pending_dr_rows.size} design reviews (#{pending_dr_rows.size} pending) across #{reviewer_data.size} reviewers (#{reviewer_data.map { |r| r[:display_name] }.join(', ')})"

  # Non-reviewer channel members (shown when SLACK_BOT_TOKEN is blank)
  non_reviewer_data.each do |attrs|
    next if User.exists?(email: attrs[:email])
    User.insert_all!([ {
      display_name: attrs[:display_name],
      email:        attrs[:email],
      slack_id:     attrs[:slack_id],
      roles:        [],
      avatar:       "https://api.dicebear.com/9.x/identicon/svg?seed=#{attrs[:email]}",
      timezone:     "UTC",
      created_at:   Time.current,
      updated_at:   Time.current
    } ])
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
      { ship_id: nil, rc_status: :approved, rc_feedback: "Requirements check passed. Good justification and sufficient hours logged.", dr_status: :returned, dr_reviewer: "seed_carol@example.com", feedback: "Please add more detail to the process section and include screenshots of the final UI before resubmitting." }
    ]

    test_cases.each do |tc|
      ship = if tc[:ship_id]
        Ship.find(tc[:ship_id])
      else
        # status :approved skips the create_initial_reviews! callback
        s_id = Ship.insert_all!(
          [ { project_id: project.id, ship_type: 0, status: 1, justification: "seed DR test",
             created_at: Time.current, updated_at: Time.current } ],
          returning: :id
        ).first["id"]
        # Approved RC review — insert_all! skips recompute_ship_status! callback
        RequirementsCheckReview.insert_all!([ {
          ship_id: s_id, reviewer_id: seed_rc&.id,
          status: RequirementsCheckReview.statuses[:approved],
          feedback: tc[:rc_feedback],
          created_at: Time.current, updated_at: Time.current
        } ])
        Ship.find(s_id)
      end

      next if DesignReview.exists?(ship: ship)

      reviewer_id = tc[:dr_reviewer] ? User.find_by(email: tc[:dr_reviewer])&.id : nil
      # insert_all! bypasses recompute_ship_status! callback
      DesignReview.insert_all!([ {
        ship_id: ship.id, reviewer_id: reviewer_id,
        status:   DesignReview.statuses[tc[:dr_status]],
        feedback: tc[:feedback],
        created_at: Time.current, updated_at: Time.current
      } ])
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
