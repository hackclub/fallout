namespace :airtable do
  desc <<~DESC
    Backfill approved ships into the YSWS Unified Submissions Airtable table.

    Default mode is dry-run — prints what *would* be uploaded without making any
    HTTP calls. Pass APPLY=1 to actually upload. Always idempotent regardless of
    flag combination:
      - Ships with an existing AirtableSync row PATCH the same Airtable record
        (no duplicate rows are ever created).
      - SKIP_EXISTING=1 (default) skips ships already synced — avoids unnecessary
        re-sends. Pass SKIP_EXISTING=0 to force PATCH every approved ship.

    Filters:
      SINCE=YYYY-MM-DD       Only ships updated_at on or after this date
      ONLY_SHIP_IDS=1,2,3    Only these ship ids (comma-separated)
      EXCLUDE_SHIP_IDS=4,5   Skip these ship ids (comma-separated)
      SKIP_EXISTING=1|0      Skip ships already synced (default 1)

    Examples:
      bin/rake airtable:backfill_unified_ships
      bin/rake airtable:backfill_unified_ships APPLY=1
      bin/rake airtable:backfill_unified_ships APPLY=1 SINCE=2026-04-01
      bin/rake airtable:backfill_unified_ships APPLY=1 ONLY_SHIP_IDS=42,43
      bin/rake airtable:backfill_unified_ships APPLY=1 SKIP_EXISTING=0   # force re-PATCH

    Run during a quiet period — concurrent approvals could race the rake on the
    same ship and leave an orphaned Airtable row. Backfill of historical ships
    is safe; freshly-approved ships are the risk surface.
  DESC
  task backfill_unified_ships: :environment do
    apply = ENV["APPLY"] == "1"
    skip_existing = ENV["SKIP_EXISTING"] != "0"
    since = ENV["SINCE"].presence && Date.parse(ENV["SINCE"])
    only_ids = (ENV["ONLY_SHIP_IDS"] || "").split(",").filter_map { |s| Integer(s, exception: false) }
    exclude_ids = (ENV["EXCLUDE_SHIP_IDS"] || "").split(",").filter_map { |s| Integer(s, exception: false) }

    if apply && ENV["AIRTABLE_API_KEY"].blank?
      abort "AIRTABLE_API_KEY is not set — refusing to APPLY"
    end

    scope = Ship.approved.includes(project: :user)
    scope = scope.where("ships.updated_at >= ?", since.beginning_of_day) if since
    scope = scope.where(id: only_ids) if only_ids.any?
    scope = scope.where.not(id: exclude_ids) if exclude_ids.any?

    candidates = scope.to_a
    puts "Approved ships matching filters: #{candidates.size}"

    candidates.reject! { |s| s.user.trial? }
    puts "After excluding trial users: #{candidates.size}"

    if skip_existing
      identifiers = candidates.map { |s| s.unified_airtable_identifier }
      synced = AirtableSync.where(record_identifier: identifiers).pluck(:record_identifier).to_set
      candidates.reject! { |s| synced.include?(s.unified_airtable_identifier) }
      puts "After excluding already-synced (SKIP_EXISTING=1): #{candidates.size}"
    end

    if candidates.empty?
      puts "Nothing to do."
      next
    end

    puts "\n--- Plan ---"
    candidates.first(10).each do |s|
      puts "  Ship##{s.id}  user=##{s.user.id} #{s.user.display_name.to_s.ljust(25)} project=#{s.project.name}"
    end
    puts "  ... and #{candidates.size - 10} more" if candidates.size > 10

    unless apply
      puts "\nDry-run only. Pass APPLY=1 to enqueue."
      next
    end

    puts "\n--- Enqueueing ---"
    candidates.each_with_index do |ship, i|
      # Same parallel pair the live approval callback fires:
      #   - ShipUnifiedAirtableUploadJob creates the Airtable record (fast).
      #   - AttachShipUnifiedScreenshotJob runs the screenshot finder + JPEG
      #     processor and POSTs to uploadAttachment; retries with backoff if
      #     the upload job hasn't finished yet.
      ShipUnifiedAirtableUploadJob.perform_later(ship.id)
      AttachShipUnifiedScreenshotJob.perform_later(ship.id)

      if (i + 1) % 25 == 0 || (i + 1) == candidates.size
        puts "  enqueued: #{i + 1}/#{candidates.size}"
      end
    end

    puts "\nDone. #{candidates.size * 2} jobs enqueued (#{candidates.size} ships × 2 jobs). Watch Solid Queue for progress."
  end
end
