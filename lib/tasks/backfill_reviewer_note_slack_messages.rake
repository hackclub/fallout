desc "Expand Slack permalink URLs in existing reviewer notes to their resolved message contents"
task backfill_reviewer_note_slack_messages: :environment do
  scope = ReviewerNote.where("body ~* ?", 'https://[a-z0-9.-]+\\.slack\\.com/archives/')
  total = scope.count
  updated = 0
  skipped = 0
  failed = 0

  puts "Scanning #{total} reviewer notes with Slack links..."

  scope.find_each do |note|
    new_body = SlackMessageFetcher.expand_urls(note.body)
    if new_body == note.body
      skipped += 1
      next
    end

    # Bypass the before_validation callback (which would re-run the same expansion)
    # and skip paper_trail noise — this is a one-time content rewrite.
    if note.update_column(:body, new_body)
      updated += 1
      print "."
    else
      failed += 1
    end
  rescue => e
    failed += 1
    warn "\nNote ##{note.id} failed: #{e.class}: #{e.message}"
  end

  puts "\nDone. Updated: #{updated}, skipped: #{skipped}, failed: #{failed}."
end
