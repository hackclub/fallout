desc "Backfill TimeAuditReview.reviewer_id for ships auto-approved via carry_forward_ta_annotations!"
task backfill_carry_forward_ta_reviewer: :environment do
  fixed = 0
  skipped = 0
  reupload = 0

  reviews = TimeAuditReview.approved.where(reviewer_id: nil).includes(ship: :project)
  puts "Found #{reviews.count} approved TA reviews with NULL reviewer_id."

  reviews.find_each do |ta|
    ship = ta.ship
    project = ship&.project
    unless project
      skipped += 1
      next
    end

    prev_ship = project.ships.where("created_at < ?", ship.created_at).order(created_at: :desc).first
    prev_ta = prev_ship&.time_audit_review

    unless prev_ta&.approved? && prev_ta.reviewer_id.present?
      puts "  Skipped TA##{ta.id} (ship##{ship.id}): no prior approved TA with reviewer"
      skipped += 1
      next
    end

    ta.update_columns(reviewer_id: prev_ta.reviewer_id, updated_at: Time.current)
    fixed += 1
    puts "  Fixed TA##{ta.id} (ship##{ship.id}) → reviewer_id=#{prev_ta.reviewer_id}"

    # Re-enqueue unified Airtable upload so TIME_AUDITOR re-renders with the now-populated reviewer.
    if ship.approved? && !ship.user.trial?
      ShipUnifiedAirtableUploadJob.perform_later(ship.id)
      reupload += 1
    end
  rescue StandardError => e
    skipped += 1
    puts "  Error TA##{ta.id}: #{e.class}: #{e.message}"
  end

  puts "Done. Fixed #{fixed}, skipped #{skipped}, re-enqueued unified upload for #{reupload}."
end
