namespace :seed do
  desc "Generate fake approved ships to test the /admin/unified_inspect/:ship_id page"
  task fake_unified_ships: :environment do
    abort "Refusing to run in production" if Rails.env.production?

    ta = upsert_reviewer!("Tilly Auditor", "fake-tilly@example.test", :time_auditor)
    rc = upsert_reviewer!("Reagan Checker", "fake-reagan@example.test", :requirements_checker)
    p2 = upsert_reviewer!("Pat Reviewer",   "fake-pat@example.test",    :pass2_reviewer)

    cases = [
      { ship_type: :design, hours: 12.5,
        owner_name: "Ada Owner",  owner_email: "fake-ada@example.test",
        project_name: "Glow Box", description: "A custom RGB-controlled bedside lamp.",
        repo: "https://github.com/fake/glow-box", demo: "https://glow.example.test",
        notes: nil, attempts: 1 },
      { ship_type: :build, hours: 8.0,
        owner_name: "Ben Builder", owner_email: "fake-ben@example.test",
        project_name: "Pico Helmet HUD",
        description: "Heads-up display for cycling helmet using a Pico W.",
        repo: "https://github.com/fake/pico-helmet-hud", demo: nil,
        notes: "Build quality matched the BOM and zine artwork. Recordings cleanly showed soldering and assembly.",
        attempts: 2 },
      { ship_type: :design, hours: 4.5,
        owner_name: "Cleo Coder", owner_email: "fake-cleo@example.test",
        project_name: "ESP Pet Feeder",
        description: "Wifi-controlled cat feeder with auto schedule.",
        repo: "https://github.com/fake/esp-pet-feeder", demo: "https://feeder.example.test",
        notes: "Some hours deflated for off-task moments; remaining work matches the deliverable.",
        attempts: 1 }
    ]

    puts "\n=== Creating fake unified-inspect ships ==="
    cases.each do |c|
      seed_one(c, ta: ta, rc: rc, p2: p2)
    end

    puts "\nDone. Each URL is presigned via UnifiedInspectToken (no login required):"
    Ship.where("frozen_repo_link LIKE 'https://github.com/fake/%'").approved.order(:id).each do |s|
      puts "  #{UnifiedInspectToken.url_for(s.id)}   (#{s.project.name}, #{s.ship_type})"
    end
  end

  # ----- helpers -----------------------------------------------------------

  def upsert_reviewer!(name, email, role)
    user = User.find_by(email: email) || User.new(
      type: "User",
      display_name: name,
      email: email,
      avatar: "https://api.dicebear.com/7.x/initials/svg?seed=#{CGI.escape(name)}",
      hca_id: "fake-#{SecureRandom.hex(6)}",
      slack_id: "FAKE#{SecureRandom.hex(4).upcase}",
      timezone: "America/Los_Angeles",
      verification_status: "verified",
      has_hca_address: true,
      onboarded: true,
      is_adult: true,
      roles: [ role.to_s ]
    )
    user.roles = ((user.roles || []) | [ role.to_s ])
    user.save!(validate: false)
    user
  end

  # A small public mp4 the HTML5 video player can actually load (so videoDuration
  # resolves and the timeline isn't stuck in the empty/pulse state). Not a
  # timelapse of real work — just a payload for verifying the read-only viewer.
  # Segments below are sized to fit inside the 30-second sample so they render
  # on-bar; in production segments are stored in *video* seconds against a much
  # longer 60×-compressed timelapse where 60-120s positions are normal.
  SAMPLE_VIDEO_URL = "https://download.samplelib.com/mp4/sample-30s.mp4".freeze
  SAMPLE_THUMB_URL = "https://placehold.co/640x360/1a1a1a/ffffff.png?text=Timelapse".freeze
  SAMPLE_VIDEO_DURATION = 30 # seconds — keep segments within this range

  ENTRY_BLUEPRINTS = [
    {
      content: <<~MD,
        ## Initial schematic + breadboard
        - Wired up the **Pi Pico W** with the OLED screen and the bike-mount sensor.
        - Sketched the message protocol between the pedal cadence sensor and the HUD.
        - First firmware boot — display shows speed within ~5% of GPS.
      MD
      session_hours: 3.0,
      segments: [
        { type: "removed",  start_seconds: 0,  end_seconds: 2,  reason: "boot/idle while power-on" },
        { type: "deflated", start_seconds: 8,  end_seconds: 18, deflated_percent: 50, reason: "background YouTube playing" }
      ]
    },
    {
      content: <<~MD,
        ## PCB rev 1 routed
        Routed both layers and ran DRC clean. Ordered the boards from JLC.
        Notes:
        1. Moved the LDO closer to the regulator inlet to shorten the trace.
        2. Added test pads on the I²C bus.
        3. Tightened the silkscreen on the connector labels.
      MD
      session_hours: 4.0,
      segments: [
        { type: "removed", start_seconds: 12, end_seconds: 18, reason: "BOM lookup outside the editor" }
      ]
    },
    {
      content: <<~MD,
        ## Helmet integration + zine page
        - 3D-printed the helmet bracket and tweaked tolerances twice.
        - Wrote the A5 zine page covering BOM and assembly.
        - End-of-day sanity check ride: HUD readable in daylight.
      MD
      session_hours: 5.0,
      segments: [
        { type: "deflated", start_seconds: 22, end_seconds: 28, deflated_percent: 25, reason: "intermittent off-camera time" }
      ]
    }
  ].freeze

  def seed_one(c, ta:, rc:, p2:)
    owner = upsert_owner!(c[:owner_name], c[:owner_email])
    project = Project.create!(
      user: owner,
      name: c[:project_name],
      description: c[:description],
      repo_link: c[:repo],
      demo_link: c[:demo]
    )

    # Distribute the case's total hours across 1-3 entries so auditors see
    # multi-entry grouping. Caps at len(ENTRY_BLUEPRINTS).
    blueprints = ENTRY_BLUEPRINTS.first([ (c[:hours] / 3.0).ceil, ENTRY_BLUEPRINTS.length ].min)
    journal_recordings = blueprints.map.with_index do |bp, i|
      entry = JournalEntry.new(project: project, user: owner, content: bp[:content])
      entry.save!(validate: false)

      lapse = LapseTimelapse.new(
        user: owner,
        lapse_timelapse_id: "fake-#{SecureRandom.hex(6)}",
        name: "#{c[:project_name]} session #{i + 1}",
        duration: (bp[:session_hours] * 3600).to_i,
        playback_url: SAMPLE_VIDEO_URL,
        thumbnail_url: SAMPLE_THUMB_URL
      )
      lapse.save!(validate: false)

      rec = Recording.create!(recordable: lapse, journal_entry: entry, user: owner)
      [ rec, bp ]
    end

    # Optional prior returned ship(s) to populate "after N rounds of feedback".
    (c[:attempts] - 1).times do
      prior = build_ship!(project, c)
      prior.time_audit_review.update!(
        status: :returned, reviewer_id: ta.id,
        feedback: "Please trim inactive time.", approved_seconds: 0
      )
      # recompute_status! cascades pending RC to cancelled and ship to :returned
      prior.reload
    end

    ship = build_ship!(project, c)

    # TA annotations: per-recording segments + description so the timeline
    # actually shows red/amber bars and the orig→approved deflation differs.
    annotations = { "recordings" => {} }
    journal_recordings.each do |rec, bp|
      annotations["recordings"][rec.id.to_s] = {
        "segments" => bp[:segments].map(&:stringify_keys),
        "description" => "Reviewed #{(bp[:session_hours]).round(1)}h session — see segments for trim/deflation rationale."
      }
    end

    ship.time_audit_review.update!(
      status: :approved,
      reviewer_id: ta.id,
      # compute_approved_seconds is private; .send keeps the seed in lock-step with the
      # production formula instead of re-deriving it here.
      approved_seconds: ship.send(:compute_approved_seconds, annotations),
      annotations: annotations
    )
    ship.requirements_check_review.update!(
      status: :approved,
      reviewer_id: rc.id
    )

    # Phase 2 review was created by recompute_status! → ensure_phase_two_review!
    ship.reload
    phase_two = ship.design_review || ship.build_review
    phase_two.update!(
      status: :approved,
      reviewer_id: p2.id,
      internal_reason: c[:notes],
      koi_adjustment: 0,
      hours_adjustment: 0
    )

    ship.reload
    puts "  Ship ##{ship.id} (#{c[:ship_type]}) → #{ship.status}, #{(ship.approved_seconds.to_i / 3600.0).round(1)}h, koi=#{KoiTransaction.where(ship_id: ship.id).sum(:amount)}"
  end

  def upsert_owner!(name, email)
    User.find_by(email: email) || begin
      u = User.new(
        type: "User",
        display_name: name,
        email: email,
        avatar: "https://api.dicebear.com/7.x/initials/svg?seed=#{CGI.escape(name)}",
        hca_id: "fake-#{SecureRandom.hex(6)}",
        slack_id: "FAKE#{SecureRandom.hex(4).upcase}",
        timezone: "America/Los_Angeles",
        verification_status: "verified",
        has_hca_address: true,
        onboarded: true,
        is_adult: true,
        roles: []
      )
      u.save!(validate: false)
      u
    end
  end

  def build_ship!(project, c)
    ship = Ship.new(
      project: project,
      ship_type: c[:ship_type],
      status: :pending,
      frozen_repo_link: c[:repo],
      frozen_demo_link: c[:demo]
    )
    ship.save!(validate: false)
    # after_create :create_initial_reviews! makes TA + RC
    ship.reload
    ship
  end
end
