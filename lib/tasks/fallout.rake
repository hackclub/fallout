namespace :fallout do
  desc "Backfill Project#unified_thumbnail for kept projects with a repo_link that have never been checked. Batched + jittered. Safe to re-run (no-op once cron catches up)."
  task backfill_unified_thumbnails: :environment do
    batch_size = ENV.fetch("BATCH_SIZE", "50").to_i
    delay_seconds = ENV.fetch("DELAY_SECONDS", "60").to_i

    # Backfill is a one-time catch-up for never-checked projects. RefreshStaleUnifiedThumbnailsJob
    # owns the ongoing 24h refresh — filtering here keeps re-runs idempotent after a partial failure.
    scope = Project.kept
                   .where.not(repo_link: [ nil, "" ])
                   .where(unified_thumbnail_checked_at: nil)
    total = scope.count
    estimated_seconds = (total.to_f / batch_size).ceil * delay_seconds
    puts "Backfilling #{total} projects in batches of #{batch_size} every #{delay_seconds}s"
    puts "Estimated wall time: ~#{estimated_seconds}s (#{(estimated_seconds / 60.0).round(1)} min)"

    enqueued = 0
    scope.find_each.with_index do |project, i|
      wait = (i / batch_size) * delay_seconds + rand(0..30)
      ComputeProjectUnifiedThumbnailJob.set(wait: wait.seconds).perform_later(project.id)
      enqueued += 1
    end

    puts "Enqueued #{enqueued} jobs."
  end
end
