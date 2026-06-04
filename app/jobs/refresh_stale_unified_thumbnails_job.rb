class RefreshStaleUnifiedThumbnailsJob < ApplicationJob
  queue_as :background

  STALE_AFTER = 24.hours
  PER_RUN_LIMIT = 200
  JITTER_WINDOW = 30.minutes

  def perform
    # Only refresh projects that ALREADY have a cover — a cheap etag conditional GET to catch
    # zine *updates*. Projects without a cover are never blind-scanned here; they're discovered
    # on demand (refresh_cover), at preflight, and at ship approval. INNER JOIN (not an IN-subquery)
    # so Postgres can probe the (record_type, record_id, name) uniqueness-index prefix per project.
    scope = Project.kept
      .where.not(repo_link: [ nil, "" ])
      .joins(:unified_thumbnail_attachment)
      .where("unified_thumbnail_checked_at IS NULL OR unified_thumbnail_checked_at < ?", STALE_AFTER.ago)
      .order(Arel.sql("unified_thumbnail_checked_at ASC NULLS FIRST"))
      .limit(PER_RUN_LIMIT)

    enqueued = 0
    # .each (not .find_each) — find_each silently drops our ORDER BY and would
    # round-robin by primary key instead of stalest-first. PER_RUN_LIMIT is
    # small so loading the result set in one shot is fine.
    scope.each do |project|
      jitter = rand(0..JITTER_WINDOW.to_i).seconds
      ComputeProjectUnifiedThumbnailJob.set(wait: jitter).perform_later(project.id)
      enqueued += 1
    end

    Rails.logger.info("RefreshStaleUnifiedThumbnailsJob: enqueued #{enqueued} refreshes")
  end
end
