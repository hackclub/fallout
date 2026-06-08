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
  fixture_users = User.where(type: "TrialUser", display_name: [ "Unified Tester", "Project Tester", "Refresh Tester" ])
  purged_count = fixture_users.count
  if purged_count.positive?
    # FeaturedProject's FK to projects is non-cascading by design (we want hard project deletes
    # to be explicit). Clear referencing rows first so the user → project cascade can proceed.
    FeaturedProject.where(project_id: Project.where(user_id: fixture_users.select(:id))).delete_all
    fixture_users.destroy_all
    puts "Purged #{purged_count} legacy test-fixture users (cascaded to their projects)"
  end

  # --- Realistic demo dataset ----------------------------------------------
  # Curated full users + real open-source hardware projects (genuine repo links and
  # real cover photos pulled from each repo's README) + hand-written multi-entry build
  # journals, so the bulletin board / explore feed / admin dashboards show authentic
  # content. Covers download through UnifiedScreenshotProcessor (SSRF-safe, IPv4-
  # preferring, transcoded to JPEG) — the same path the live cover pipeline uses.
  # Idempotent: existing demo projects are left untouched; delete a demo user to rebuild it.
  demo = [
    { first: "Maya", last: "Lindqvist", hours: 34,
      name: "Lily58 Split Keyboard",
      description: "A 58-key column-staggered split keyboard built to end my wrist pain. Hand-soldered SMD diodes, QMK firmware with a custom layer-based keymap, and a 3D-printed tenting case.",
      repo_link: "https://github.com/kata0510/Lily58",
      tags: %w[keyboard ergonomics qmk],
      cover: "https://user-images.githubusercontent.com/6285554/84393842-13960900-ac37-11ea-811e-65db2948ca73.jpg",
      journal: [
        "Finally committing to a split keyboard — my wrists have had enough. Ordered the Lily58 PCBs from JLCPCB and a set of Kailh Choc browns. Now the long wait for shipping.",
        "PCBs arrived! Spent tonight soldering the diodes — 58 of them, all SMD. My hands are cramping but the joints look clean under the loupe. Tweezers plus a flux pen is the only way to stay sane.",
        "Pro Micro flashed with QMK and the left half is alive. Three columns were dead — turned out I'd bridged two diode pads. Reflowed them and we're back to 100%.",
        "Wrote my first custom keymap with a symbol layer and arrows on the thumb cluster. Took an evening to stop fat-fingering it, but my typing speed is already creeping back up.",
        "Printed a tenting case in TPU and glued on rubber feet. It's done — typed this whole entry on it. The split angle is a revelation. Writing up a parts list for anyone else considering the jump."
      ] },
    { first: "Diego", last: "Herrera", hours: 41,
      name: "Sofle Keyboard",
      description: "A split keyboard with rotary encoders and per-half OLED displays. Hot-swap sockets, RGB underglow, and an acrylic case stack. KiCad sources and a QMK keymap.",
      repo_link: "https://github.com/josefadamcik/SofleKeyboard",
      tags: %w[keyboard split-keyboard kicad],
      cover: "https://raw.githubusercontent.com/josefadamcik/SofleKeyboard/HEAD/Images/IMG_20191104_202757.jpg",
      journal: [
        "Starting a Sofle — it's like a Lily58 but with rotary encoders and OLED screens, which sold me instantly. Pulled the KiCad files and sent them off to PCBWay.",
        "Hot-swap sockets soldered. I went with Kailh hotswap so I can change switches later without desoldering — past me always regrets soldering switches directly.",
        "OLED displays wired up and showing a WPM counter. Watching my words-per-minute tick up in real time is weirdly motivating. The encoder is mapped to volume for now.",
        "Underglow RGB is in. Spent way too long picking an animation in QMK — settled on a slow rainbow I'll probably turn off in a week. Worth it.",
        "Final assembly: acrylic case stack, brass standoffs, o-ring dampened switches. The typing sound is chef's kiss. Calling this one shipped."
      ] },
    { first: "Priya", last: "Nair", hours: 28,
      name: "Skeletyl 36-Key",
      description: "A low-profile, column-staggered 36-key split keyboard from the Bastard Keyboards family. Matte PETG unibody case, Elite-C controllers, per-key RGB, home-row mods.",
      repo_link: "https://github.com/bastardkb/skeletyl",
      tags: %w[keyboard 3d-printing split-keyboard],
      cover: "https://raw.githubusercontent.com/bastardkb/skeletyl/HEAD/pics/unibody.jpg",
      journal: [
        "My next board should be tiny. The Skeletyl's 36-key layout looks intimidating but everyone says you adapt fast. Printing the unibody case in matte black PETG.",
        "Case came off the printer with minimal stringing after I dropped the temp 5°C. Test-fit the PCB and the standoffs line up perfectly — Bastard Keyboards did their tolerance homework.",
        "Soldered the Elite-C and the per-key RGB. One corner LED is stuck blue — chasing down whether it's the LED or a cold joint on the data line tomorrow.",
        "Found it: cold joint on the DIN pad of the dead LED. Reflowed and the whole chain lights up now. 90% of keyboard bugs really are just solder joints.",
        "36 keys felt impossible for two days and now I can't imagine going back. Home-row mods changed my life. Build log and keymap are up in the repo."
      ] },
    { first: "Wei", last: "Chen", hours: 22,
      name: "DIY SpaceMouse",
      description: "An open-source 3D navigation device for CAD, built from hall-effect sensors and magnets for under $30. Startup calibration for drift, axes mapped to pan/orbit/zoom in Fusion 360.",
      repo_link: "https://github.com/sb-ocr/diy-spacemouse",
      tags: %w[hardware cad input-device],
      cover: "https://raw.githubusercontent.com/sb-ocr/diy-spacemouse/HEAD/Images/Spacemouse_Thumbnail@2x.png",
      journal: [
        "I live in Fusion 360 and a real SpaceMouse is $150+. Found an open-source DIY version using hall-effect sensors and magnets — BOM under $30. Ordering the sensors.",
        "Printed the gimbal and the base. The magnet mounts are press-fit and snug. Waiting on the controller before I can read the sensors.",
        "Raw hall-effect readings are printing over serial. The values drift with temperature, so I added a startup calibration that zeroes them. Movement detection works in every direction!",
        "Mapped the axes to pan/orbit/zoom in Fusion. Tuning the deadzone and sensitivity curves took a few tries — too sensitive and the model flies off screen.",
        "Glued the knob on and it feels great in the hand. Modeling a bracket *with* the SpaceMouse felt meta. Wrote up the calibration steps since that tripped me up the most."
      ] },
    { first: "Jonas", last: "Bauer", hours: 31,
      name: "daytripper Tripwire",
      description: "A laser tripwire that hides every window the instant someone walks up behind my desk. Pulsed laser + photodiode receiver talking to a USB dongle over 2.4GHz, with 3D-printed enclosures.",
      repo_link: "https://github.com/dekuNukem/daytripper",
      tags: %w[hardware automation wireless],
      cover: "https://raw.githubusercontent.com/dekuNukem/daytripper/HEAD/resources/photos/face_note.jpg",
      journal: [
        "Building daytripper: a laser tripwire that hides all my windows the instant someone walks up behind me. Equal parts useful and ridiculous. Ordered the laser module and receiver PCB.",
        "Transmitter and receiver assembled. Aligning the laser across my doorway is fiddly — a 1mm tilt and the photodiode misses entirely. Added a pot to tune the threshold.",
        "Receiver talks to a USB dongle over 2.4GHz. Wrote the host script that fires a global hotkey when the beam breaks. First test: walked through, all windows minimized. It works!",
        "Battery life was terrible — the transmitter ran hot all day. Switched the laser to pulsed mode synced with the receiver's sampling window and cut current draw by ~80%.",
        "3D-printed enclosures for both ends and mounted them with the brackets. Demoed it to my roommate and watched their face when my screen vanished. Shipping it."
      ] },
    { first: "Amara", last: "Okeke", hours: 26,
      name: "duckyPad Macropad",
      description: "A 15-key mechanical macropad that runs scripts, with an OLED for profile names and per-key RGB. STM32-based, per-app profile switching, macros defined in a plain text file.",
      repo_link: "https://github.com/dekuNukem/duckyPad",
      tags: %w[hardware macropad stm32],
      cover: "https://raw.githubusercontent.com/dekuNukem/duckyPad/HEAD/resources/pics/caps.jpg",
      journal: [
        "My workflow has too many shortcuts to remember, so I'm building a duckyPad — a 15-key mechanical macropad that runs scripts. STM32 with an OLED for profile names.",
        "Soldered the switches and the OLED. The STM32 enumerated as a composite USB device on the first try, which never happens. Flashed the firmware and the demo profile lit up.",
        "Wrote my first duckyScript macros — one opens my dev environment, another runs my git commit-and-push routine. Per-app profile switching detects the focused window and swaps the keymap.",
        "Added RGB feedback so each key glows its profile color. The config-file format took an hour to learn, but now adding a macro is just editing a text file on the flash drive.",
        "Laser-cut an acrylic case and added rubber feet. It lives under my monitor and I genuinely use it every day. Documented my favorite macros in the README."
      ] },
    { first: "Sofia", last: "Russo", hours: 19,
      name: "E-Paper Weather Station",
      description: "A low-power weather display: an ESP32 driving a 2.9\" e-paper panel, pulling forecasts from OpenWeatherMap. Deep-sleeps between updates to run for months on three AAs.",
      repo_link: "https://github.com/G6EJD/ESP32-e-Paper-Weather-Display",
      tags: %w[iot esp32 e-paper],
      cover: "https://raw.githubusercontent.com/G6EJD/ESP32-e-Paper-Weather-Display/HEAD/Waveshare_1_54.jpg",
      journal: [
        "Building a low-power weather display: ESP32 driving a 2.9\" e-paper panel, forecasts from the OpenWeatherMap API. Goal is something that runs for months on a battery.",
        "Got the e-paper refreshing with a hello-world. These panels are slow (~2s full refresh) but the paper-like contrast is so worth it for a glanceable display.",
        "Parsing the weather JSON on an ESP32 with limited RAM meant switching to a streaming parser. Now showing temp, an icon, and a three-day forecast row. Layout took a lot of pixel-pushing.",
        "Implemented deep sleep between updates — wakes every 30 minutes, fetches, redraws, sleeps. Multimeter says ~40µA asleep. Should run all winter on 3 AAs.",
        "Built a little wood frame and stood it on my desk. The e-paper makes it look like a printed card that magically updates. Pushed the firmware and a wiring diagram."
      ] },
    { first: "Kenji", last: "Watanabe", hours: 24,
      name: "RGB LED Matrix Board",
      description: "A 64x32 HUB75 RGB matrix desk display driven by a Raspberry Pi. Cycles a clock, weather, next calendar event, and dithered Spotify album art behind a diffused acrylic front.",
      repo_link: "https://github.com/hzeller/rpi-rgb-led-matrix",
      tags: %w[led raspberry-pi display],
      cover: "https://raw.githubusercontent.com/hzeller/rpi-rgb-led-matrix/HEAD/img/user-action-shot.jpg",
      journal: [
        "Picked up a 64x32 HUB75 RGB matrix to make a desk info board, driving it from a Raspberry Pi with hzeller's library. The ribbon-cable pinout is a maze — triple-checking before power-on.",
        "It's alive and blindingly bright! Dialed brightness to 50%. Refresh flicker was visible on camera until I enabled hardware PWM on a dedicated GPIO.",
        "Wrote a Python service that cycles clock, weather, and my next calendar event. Scrolling text needed double-buffering to stop tearing — buttery smooth now.",
        "Added a now-playing panel that pulls album art from the Spotify API and dithers it to the matrix's color depth. Tiny pixel album covers are unreasonably charming.",
        "Built a diffused acrylic front and a 3D-printed frame to soften the pixels, then mounted it on the wall. Wrote up the wiring and the systemd setup."
      ] },
    { first: "Leila", last: "Hassan", hours: 47,
      name: "NanoVNA Analyzer",
      description: "A pocket vector network analyzer for antenna and filter tuning up to 900MHz. STM32 + Si5351, reflow-soldered QFNs, open/short/load calibration, and a 3D-printed portable case.",
      repo_link: "https://github.com/ttrftech/NanoVNA",
      tags: %w[rf test-equipment stm32],
      cover: "https://raw.githubusercontent.com/ttrftech/NanoVNA/HEAD/doc/nanovna-pcb-photo.jpg",
      journal: [
        "Antenna tuning by guesswork is over — building a NanoVNA, a pocket vector network analyzer. Measures impedance and SWR to 900MHz. The STM32 + Si5351 BOM is shockingly cheap.",
        "Reflow went well except two QFN pins bridged on the mixer IC. Cleaned them with wick and flux under the microscope. Continuity checks all pass now.",
        "Firmware flashed and the touchscreen calibrates. Did the open/short/load cal on the test ports — the Smith chart traces are actually tracking. I can't believe this works.",
        "Measured my handmade 2m antenna and found resonance was 8MHz too high. Trimmed the elements off the SWR plot and got it dead-on. This tool already paid for itself.",
        "Printed a case with a battery compartment so it's truly portable. Characterized a stack of filters at the bench. Notes and calibration tips are in the repo."
      ] },
    { first: "Tomas", last: "Novak", hours: 58,
      name: "Voron 2.4 Printer",
      description: "A self-sourced Voron 2.4: a 300mm CoreXY 3D printer with a flying gantry and quad independent Z. Klipper on an Octopus board, input shaping, pressure advance — and it prints its own upgrades.",
      repo_link: "https://github.com/VoronDesign/Voron-2",
      tags: %w[3d-printing corexy hardware],
      cover: "http://vorondesign.com/images/voron2.4.jpg",
      journal: [
        "The big one: building a Voron 2.4 from a self-sourced kit. 300mm CoreXY with a flying gantry. Spent the whole weekend just reading the manual and sorting M3 hardware into bins.",
        "Frame is squared and the linear rails are mounted. Getting the gantry square took three attempts and a dial indicator — 'measure twice' is an understatement here.",
        "Wired the Octopus board and flashed Klipper. The flying gantry uses four independent Z motors for quad gantry leveling — watching them auto-level the gantry is mesmerizing.",
        "First-layer fights took two evenings of pressure-advance and Z-offset tuning. After a fresh PID tune and an input-shaper run, the test cube came out within 0.05mm and the ringing is gone.",
        "Printed its first real part: a desk parts tray, in its own filament. A printer that prints its own upgrades. Full build log, mods, and my Klipper config are up."
      ] }
  ]

  demo_emails = demo.map { |d| "#{d[:first].downcase}.#{d[:last].downcase}@fallout.demo" }

  # Clear prior demo identities (the old picsum-cover projects) that aren't in the new set.
  # FeaturedProject's FK to projects is non-cascading by design — clear referencing rows
  # first so the user → project destroy cascade can proceed.
  stale_demo = User.where("email LIKE ?", "%@fallout.demo").where.not(email: demo_emails)
  if stale_demo.exists?
    FeaturedProject.where(project_id: Project.where(user_id: stale_demo.select(:id))).delete_all
    purged = stale_demo.count
    stale_demo.destroy_all
    puts "Cleared #{purged} stale demo users (cascaded to their projects)"
  end

  demo.each_with_index do |d, index|
    email = "#{d[:first].downcase}.#{d[:last].downcase}@fallout.demo"
    slug = "#{d[:first]}-#{d[:last]}".parameterize

    # Curated full users (type=nil). slack_id/hca_id are required for non-trial accounts.
    user = User.find_or_initialize_by(email: email)
    if user.new_record?
      user.assign_attributes(
        type: nil,
        display_name: "#{d[:first]} #{d[:last]}",
        first_name: d[:first],
        last_name: d[:last],
        avatar: "https://api.dicebear.com/9.x/lorelei/svg?seed=#{slug}",
        timezone: "America/New_York",
        slack_id: "UDEMO#{1000 + index}",
        hca_id: "demo-hca-#{slug}",
        onboarded: true,
        is_adult: true,
        roles: %w[user]
      )
      user.save!
    end

    project = Project.find_or_initialize_by(name: d[:name], user: user)
    next unless project.new_record? # already seeded — don't re-download or duplicate journals

    project.assign_attributes(
      description: d[:description],
      repo_link: d[:repo_link],
      tags: d[:tags],
      manual_seconds: d[:hours] * 3600, # gives the project realistic logged hours on cards/explore
      is_unlisted: false
    )
    project.save!

    # Real cover photo from the repo, fetched + transcoded through the live cover pipeline.
    cover_jpeg = nil
    begin
      result = ShipChecks::UnifiedScreenshotProcessor.download_with_etag(d[:cover], if_none_match: nil)
      if result[:status] == :changed && result[:bytes].present?
        # Resolve + guard the content type like the cover job does: a server returning an unknown or blank
        # Content-Type would otherwise make transcode_to_jpeg's EXT_FOR_CONTENT_TYPE.fetch raise and abort db:seed.
        effective_type = ShipChecks::UnifiedScreenshotProcessor.resolve_content_type(result[:content_type], d[:cover])
        if ShipChecks::UnifiedScreenshotProcessor::SUPPORTED_CONTENT_TYPES.include?(effective_type)
          cover_jpeg = ShipChecks::UnifiedScreenshotProcessor.transcode_to_jpeg(result[:bytes], effective_type)
        end
      end
    rescue => e
      warn "  cover processing failed for #{d[:name]}: #{e.message}"
    end
    if cover_jpeg
      project.unified_thumbnail.attach(io: StringIO.new(cover_jpeg), filename: "#{d[:name].parameterize}.jpg", content_type: "image/jpeg")
    else
      warn "  could not fetch cover for #{d[:name]}: #{result[:status]} #{result[:detail]}"
    end

    d[:journal].each_with_index do |text, n|
      entry = JournalEntry.create!(user: user, project: project, content: text)
      # Attach the real project photo to the final ("it's done") entry so journal cards carry authentic media.
      next unless n == d[:journal].length - 1 && cover_jpeg
      entry.images.attach(io: StringIO.new(cover_jpeg), filename: "#{d[:name].parameterize}-final.jpg", content_type: "image/jpeg")
    end
  end

  demo_scope = User.verified.where(email: demo_emails)
  puts "Realistic demo: #{demo_scope.count} users, " \
       "#{Project.where(user_id: demo_scope.select(:id)).count} projects, " \
       "#{JournalEntry.where(user_id: demo_scope.select(:id)).count} journal entries"

  # Give the first demo project an approved design Ship so the path / hours-stats dashboards have
  # build-approved hours to render (logged hours come from manual_seconds above). Anchoring this to
  # a real demo project avoids a throwaway placeholder cluttering the explore feed.
  approved_target = Project.where(user_id: demo_scope.select(:id)).order(:id).first
  if approved_target
    Ship.find_or_create_by!(project: approved_target) do |s|
      s.ship_type = :design
      s.status = :approved # created (not updated) as approved, so the airtable-upload after_update_commit doesn't fire
      s.approved_public_seconds = approved_target.manual_seconds
      s.justification = "Seeded for hours dashboards"
    end
    puts "Gave '#{approved_target.name}' an approved ship (#{approved_target.manual_seconds / 3600}h)"
  end

  # Give demo users varying lifetime approved hours across 1-2 projects + a pending DR each.
  # format: display_name => { projects: [{name:, hours:, tags:}], pending_hours: }
  # pending_hours = TA hours for the new pending DR ship (on the last listed project)
  seed_rc_user = User.find_by(email: "seed_alice@example.com")

  demo_dr_data = {
    "Tongyu Zhou" => {
      projects: [ { name: "Wireless Sensor Node", hours: 12, tags: %w[iot esp32] } ],
      pending_hours: 12
    },
    "Cyao Lin" => {
      projects: [
        { name: "Cyao's PCB Badge",     hours: 20, tags: %w[hardware kicad] },
        { name: "Cyao's OLED Watch",    hours: 18, tags: %w[hardware wearable] }
      ],
      pending_hours: 18
    },
    "Antush Patel" => {
      projects: [
        { name: "Antush's Sensor Array",   hours: 5, tags: %w[iot sensors] },
        { name: "Antush's Display Module", hours: 3, tags: %w[hardware display] }
      ],
      pending_hours: 3
    },
    "Mira Suzuki" => {
      projects: [
        { name: "Mira's Wearable Sensor", hours: 15, tags: %w[hardware wearable] },
        { name: "Mira's Solar Tracker",   hours: 10, tags: %w[hardware solar] }
      ],
      pending_hours: 10
    },
    "Joon Park" => {
      projects: [
        { name: "Joon's Mechanical Keyboard", hours: 28, tags: %w[keyboard hardware] },
        { name: "Joon's LED Controller",      hours: 16, tags: %w[hardware rgb] }
      ],
      pending_hours: 16
    },
    "Sade Okafor" => {
      projects: [
        { name: "Sade's First PCB",  hours: 4, tags: %w[hardware kicad] },
        { name: "Sade's Audio Amp",  hours: 2, tags: %w[hardware audio] }
      ],
      pending_hours: 2
    },
    "Felix Romero" => {
      projects: [
        { name: "Felix's Motor Driver",     hours: 12, tags: %w[hardware motors] },
        { name: "Felix's Enclosure Design", hours: 7,  tags: %w[hardware 3d-printing] }
      ],
      pending_hours: 7
    }
  }

  demo_dr_data.each do |display_name, data|
    demo_user = demo_scope.find_by(display_name: display_name)
    next unless demo_user

    # Wipe previous pending-DR seed ships for this user to keep re-runs clean
    old_ids = Ship.joins(:project).where(projects: { user_id: demo_user.id }, justification: "seed pending DR").pluck(:id)
    if old_ids.any?
      DesignReview.where(ship_id: old_ids).delete_all
      RequirementsCheckReview.where(ship_id: old_ids).delete_all
      TimeAuditReview.where(ship_id: old_ids).delete_all
      Ship.where(id: old_ids).delete_all
    end

    last_proj = nil
    data[:projects].each do |proj_data|
      proj = Project.find_or_create_by!(name: proj_data[:name], user: demo_user) do |p|
        p.description = "Seeded project — #{proj_data[:name]}"
        p.repo_link = "https://github.com/fallout-demo/#{proj_data[:name].parameterize}"
        p.tags = proj_data[:tags]
        p.is_unlisted = false
      end

      approved_ship = Ship.find_or_create_by!(project: proj, justification: "seed lifetime hours") do |s|
        s.ship_type = :design
        s.status = :approved
        s.approved_public_seconds = proj_data[:hours] * 3600
      end
      approved_ship.update!(status: :approved, approved_public_seconds: proj_data[:hours] * 3600)

      last_proj = proj
    end

    # Pending DR on the last project
    new_ship_id = Ship.insert_all!(
      [ { project_id: last_proj.id, ship_type: 0, status: 1, justification: "seed pending DR",
          created_at: Time.current, updated_at: Time.current } ],
      returning: :id
    ).first["id"]

    pending_h = data[:pending_hours]
    RequirementsCheckReview.insert_all!([ {
      ship_id: new_ship_id, reviewer_id: seed_rc_user&.id,
      status: RequirementsCheckReview.statuses[:approved], feedback: "Requirements verified.",
      completed_at: Time.current, created_at: Time.current, updated_at: Time.current
    } ])
    TimeAuditReview.insert_all!([ {
      ship_id: new_ship_id, reviewer_id: seed_rc_user&.id,
      status: TimeAuditReview.statuses[:approved],
      approved_public_seconds: pending_h * 3600,
      completed_at: Time.current, created_at: Time.current, updated_at: Time.current
    } ])
    DesignReview.insert_all!([ {
      ship_id: new_ship_id, reviewer_id: nil,
      status: DesignReview.statuses[:pending],
      completed_at: nil, created_at: Time.current, updated_at: Time.current
    } ])
  end
  puts "Seeded pending DR ships for demo users with varied lifetime hours"
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
    TimeAuditReview.where(ship_id: seed_ship_ids).delete_all
    KoiTransaction.where(ship_id: seed_ship_ids).delete_all
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
  # is_unlisted: these are admin reviewer-stats scaffolding (1000+ rows) — keep them OUT of the
  # public explore feed (public_for_explore = kept.listed) while the reviews still feed the dashboard.
  project_rows = specs.map.with_index { |s, i|
    { name: "Seed RC #{i}", description: "seed-rc", user_id: student.id, is_unlisted: true, created_at: s[:ts], updated_at: s[:ts] }
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
      completed_at: dr_ts, created_at: dr_ts, updated_at: dr_ts }
  end

  # 3 pending design reviews (no reviewer assigned yet), with varied TA-approved hours so sort works
  pending_ship_ids = ship_ids.reject { |id| dr_rows.any? { |r| r[:ship_id] == id } }.first(3)
  pending_dr_rows = pending_ship_ids.map { |sid|
    { ship_id: sid, reviewer_id: nil, status: DesignReview.statuses[:pending],
      completed_at: nil, created_at: Time.current, updated_at: Time.current }
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
    seed_rc  = User.find_by(email: "seed_alice@example.com")
    seed_bob = User.find_by(email: "seed_bob@example.com")

    # Wipe previous seed DR test ships so re-runs don't accumulate duplicates
    old_ship_ids = Ship.where(project: project, justification: "seed DR test").pluck(:id)
    if old_ship_ids.any?
      DesignReview.where(ship_id: old_ship_ids).delete_all
      RequirementsCheckReview.where(ship_id: old_ship_ids).delete_all
      TimeAuditReview.where(ship_id: old_ship_ids).delete_all
      Ship.where(id: old_ship_ids).delete_all
    end

    # Each entry: rc_feedback, ta_hours, dr_status, dr_reviewer, dr_feedback
    test_cases = [
      { rc_feedback: "All requirements met. Hours well documented.",                                             ta_hours: 24, dr_status: :pending,  dr_reviewer: nil,       feedback: nil },
      { rc_feedback: "Hours verified. Project scope is appropriate.",                                            ta_hours: 15, dr_status: :pending,  dr_reviewer: nil,       feedback: nil },
      { rc_feedback: "Requirements check passed. Good justification.",                                           ta_hours: 9,  dr_status: :approved, dr_reviewer: seed_bob,  feedback: "Great work! Clean design. Approved." },
      { rc_feedback: "Requirements check passed. Good justification and sufficient hours logged.",               ta_hours: 6,  dr_status: :returned, dr_reviewer: seed_rc,   feedback: "Please add more detail to the process section before resubmitting." }
    ]

    test_cases.each do |tc|
      s_id = Ship.insert_all!(
        [ { project_id: project.id, ship_type: 0, status: 1, justification: "seed DR test",
            created_at: Time.current, updated_at: Time.current } ],
        returning: :id
      ).first["id"]

      RequirementsCheckReview.insert_all!([ {
        ship_id: s_id, reviewer_id: seed_rc&.id,
        status: RequirementsCheckReview.statuses[:approved],
        feedback: tc[:rc_feedback],
        completed_at: Time.current, created_at: Time.current, updated_at: Time.current
      } ])

      TimeAuditReview.insert_all!([ {
        ship_id: s_id, reviewer_id: seed_rc&.id,
        status: TimeAuditReview.statuses[:approved],
        approved_public_seconds: tc[:ta_hours] * 3600,
        completed_at: Time.current, created_at: Time.current, updated_at: Time.current
      } ])

      DesignReview.insert_all!([ {
        ship_id: s_id, reviewer_id: tc[:dr_reviewer]&.id,
        status: DesignReview.statuses[tc[:dr_status]],
        feedback: tc[:feedback],
        completed_at: tc[:dr_status] == :pending ? nil : Time.current,
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

# Dev-only: Unreviewed Hours / Unreviewed Total chart sample data.
# Creates ships with YouTubeVideo recordings so backlog_hours_by_day's recording-duration
# SQL has data to aggregate. Ships are spread across weeks from the chart's start date.
if Rails.env.development?
  ta_reviewer_for_hours = User.find_by(email: "seed_alice@example.com")

  unless User.exists?(email: "seed_hours_student@example.com")
    User.insert_all!([ {
      display_name: "Hours Seed Student",
      email:        "seed_hours_student@example.com",
      roles:        [],
      avatar:       "https://api.dicebear.com/9.x/identicon/svg?seed=seed_hours_student",
      timezone:     "UTC",
      created_at:   Time.current,
      updated_at:   Time.current
    } ])
  end
  hb_user = User.find_by!(email: "seed_hours_student@example.com")

  hb_proj = Project.find_or_create_by!(name: "Hours Backlog Seed Project", user: hb_user) do |p|
    p.description = "seed-hours-backlog"
    p.repo_link   = "https://github.com/fallout-demo/seed-hours"
    p.is_unlisted = true
  end

  # Wipe previous runs so re-seeding is clean
  old_ship_ids = Ship.where(project: hb_proj, justification: "seed hours backlog").pluck(:id)
  if old_ship_ids.any?
    je_ids_to_clean = JournalEntry.where(ship_id: old_ship_ids).pluck(:id)
    if je_ids_to_clean.any?
      yt_ids_to_clean = Recording.where(journal_entry_id: je_ids_to_clean, recordable_type: "YouTubeVideo").pluck(:recordable_id)
      Recording.where(journal_entry_id: je_ids_to_clean).delete_all
      YouTubeVideo.where(id: yt_ids_to_clean).delete_all
      JournalEntry.where(id: je_ids_to_clean).delete_all
    end
    TimeAuditReview.where(ship_id: old_ship_ids).delete_all
    Ship.where(id: old_ship_ids).delete_all
  end

  # [week_offset, hours, ta_approved] — uneven review cadence creates a visible growing backlog
  hb_chart_start = Date.new(2026, 4, 7)
  hb_specs = [
    [ 0, 12, true  ], [ 0, 10, true  ], [ 0,  8, false ], [ 0, 10, false ],
    [ 1, 15, true  ], [ 1, 12, true  ], [ 1, 10, true  ], [ 1,  8, false ], [ 1, 12, false ],
    [ 2,  8, true  ], [ 2,  8, true  ], [ 2, 10, false ], [ 2, 12, false ], [ 2,  8, false ], [ 2, 10, false ],
    [ 3, 12, true  ], [ 3, 10, true  ], [ 3, 10, false ], [ 3, 12, false ], [ 3,  8, false ],
    [ 4, 15, true  ], [ 4, 12, true  ], [ 4, 10, true  ], [ 4, 10, true  ], [ 4, 10, false ], [ 4, 12, false ], [ 4,  8, false ],
    [ 5,  8, true  ], [ 5, 10, true  ], [ 5,  8, true  ], [ 5,  8, true  ], [ 5,  8, false ],
    [ 6, 12, true  ], [ 6, 10, true  ], [ 6, 10, true  ], [ 6,  8, false ], [ 6, 10, false ], [ 6,  8, false ],
    [ 7, 15, true  ], [ 7, 12, true  ], [ 7, 12, true  ], [ 7,  8, false ], [ 7,  8, false ],
    [ 8, 10, true  ], [ 8,  8, false ], [ 8, 10, false ], [ 8,  8, false ]
  ]

  rng_hb = Random.new(77)
  now_hb  = Time.current

  # YouTubeVideos — one per ship; duration drives the hours chart
  yt_rows_hb = hb_specs.each_with_index.map { |(_, hours, _), i|
    { video_id: "seed_hb_#{i.to_s.rjust(3, '0')}", title: "Seed Build Log #{i}",
      duration_seconds: hours * 3600, stretch_multiplier: 1,
      created_at: now_hb, updated_at: now_hb }
  }
  yt_ids_hb = YouTubeVideo.insert_all!(yt_rows_hb, returning: :id).map { |r| r["id"] }

  # Ships — spread within each week by a random 0–4 day offset
  ship_ts_hb = hb_specs.map { |(week, _, _)|
    (hb_chart_start + (week * 7 + rng_hb.rand(0..4)).days).to_time
  }
  ship_rows_hb = hb_specs.each_with_index.map { |_, i|
    { project_id: hb_proj.id, ship_type: 0, status: 1, justification: "seed hours backlog",
      created_at: ship_ts_hb[i], updated_at: ship_ts_hb[i] }
  }
  ship_ids_hb = Ship.insert_all!(ship_rows_hb, returning: :id).map { |r| r["id"] }

  # JournalEntries
  je_rows_hb = hb_specs.each_with_index.map { |_, i|
    { project_id: hb_proj.id, ship_id: ship_ids_hb[i], user_id: hb_user.id,
      content: "Seed hours backlog entry #{i}",
      created_at: ship_ts_hb[i], updated_at: ship_ts_hb[i] }
  }
  je_ids_hb = JournalEntry.insert_all!(je_rows_hb, returning: :id).map { |r| r["id"] }

  # Recordings linking each journal entry to its YouTube video
  rec_rows_hb = hb_specs.each_with_index.map { |_, i|
    { journal_entry_id: je_ids_hb[i], recordable_id: yt_ids_hb[i], recordable_type: "YouTubeVideo",
      user_id: hb_user.id, created_at: ship_ts_hb[i], updated_at: ship_ts_hb[i] }
  }
  Recording.insert_all!(rec_rows_hb)

  # TimeAuditReviews for ships marked as TA-approved
  ta_rows_hb = hb_specs.each_with_index.filter_map { |(week, hours, approved), i|
    next unless approved
    ta_ts = (hb_chart_start + (week * 7 + rng_hb.rand(1..5)).days).to_time
    { ship_id: ship_ids_hb[i], reviewer_id: ta_reviewer_for_hours&.id,
      status:   TimeAuditReview.statuses[:approved],
      approved_public_seconds: hours * 3600,
      completed_at: ta_ts, created_at: ta_ts, updated_at: ta_ts }
  }
  TimeAuditReview.insert_all!(ta_rows_hb) if ta_rows_hb.any?

  submitted_h_total = hb_specs.sum { |(_, h, _)| h }
  approved_h_total  = hb_specs.sum { |(_, h, ok)| ok ? h : 0 }
  puts "Seeded #{hb_specs.size} ships for hours backlog chart " \
       "(#{submitted_h_total}h submitted, #{approved_h_total}h TA-approved, " \
       "#{submitted_h_total - approved_h_total}h unreviewed)"
end
