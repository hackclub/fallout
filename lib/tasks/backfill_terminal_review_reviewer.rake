desc "Backfill reviewer_id on terminal (approved/returned/rejected) reviews where it's NULL, using the PaperTrail whodunnit of the status transition"
task backfill_terminal_review_reviewer: :environment do
  Reviewable::REVIEW_MODELS.each do |name|
    model = name.constantize
    # Cancelled reviews are auto-set by Ship#cancel_pending_reviews! and have
    # no real "reviewer" — skip them. Pending reviews don't apply.
    scope = model.where(status: %i[approved returned rejected], reviewer_id: nil)
    candidates = scope.count
    puts "#{name}: #{candidates} candidates"
    next if candidates.zero?

    fixed = 0
    skipped = 0
    reupload = 0
    scope.find_each do |review|
      current_status = review.status
      transition = review.versions.reorder(created_at: :desc).find do |v|
        v.object_changes&.dig("status")&.last.to_s == current_status
      end

      whodunnit = transition&.whodunnit
      if whodunnit.blank? || whodunnit !~ /\A\d+\z/
        puts "  Skipped #{name}##{review.id}: no usable whodunnit (#{whodunnit.inspect})"
        skipped += 1
        next
      end

      review.update_columns(reviewer_id: whodunnit.to_i, updated_at: Time.current)
      fixed += 1
      puts "  Fixed #{name}##{review.id} → reviewer_id=#{whodunnit}"

      # Re-sync the ship's unified Airtable row so the reviewer column re-renders
      # (mirrors backfill_carry_forward_ta_reviewer's behavior).
      ship = review.ship
      if ship&.approved? && !ship.user&.trial?
        ShipUnifiedAirtableUploadJob.perform_later(ship.id)
        reupload += 1
      end
    rescue StandardError => e
      skipped += 1
      puts "  Error #{name}##{review.id}: #{e.class}: #{e.message}"
    end

    puts "#{name}: fixed #{fixed}, skipped #{skipped}, re-enqueued unified upload for #{reupload}"
  end
end
