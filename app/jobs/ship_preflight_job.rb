# frozen_string_literal: true

class ShipPreflightJob < ApplicationJob
  queue_as :background

  def perform(preflight_run_id)
    preflight_run = PreflightRun.find(preflight_run_id)
    project = preflight_run.project
    cache_key = "ship_preflight:#{preflight_run.id}"

    defs = ShipCheckService::DEFINITIONS
    initial_checks = defs.map do |d|
      { key: d[:key].to_s, label: d[:label], status: "running", message: nil, visibility: d[:visibility].to_s }
    end
    Rails.cache.write(cache_key, { status: "running", checks: initial_checks }, expires_in: 5.minutes)

    # Always run all checks — internal results are stored for admin review
    results, ctx = ShipCheckService.run_all(project, run_all_checks: true, return_context: true) do |result|
      cached = Rails.cache.read(cache_key)
      next unless cached
      idx = cached[:checks].index { |c| c[:key].to_s == result.key.to_s }
      cached[:checks][idx] = result.as_json if idx
      Rails.cache.write(cache_key, cached, expires_in: 5.minutes)
    end

    user_results = results.select(&:user?)
    status = user_results.none?(&:blocking?) ? :passed : :failed

    final_results = results.map(&:as_json)

    # Persist final results to DB — source of truth after cache expires
    preflight_run.update!(
      status: status,
      checks: final_results,
      all_results: final_results
    )

    # Backfill any ship that was submitted before slow internal checks (e.g. code_plagiarism)
    # finished — its preflight_results snapshot still has those entries as "running" and the
    # admin UI filters non-terminal statuses out. Submission is intentionally not blocked on
    # internal checks, so we update the ship after-the-fact instead. update_columns skips
    # callbacks/paper_trail since this is a passive backfill, not a user-initiated change.
    preflight_run.ship&.update_columns(preflight_results: final_results, updated_at: Time.current)

    # Update cache so active pollers see the final state
    Rails.cache.write(cache_key, {
      status: status.to_s,
      checks: final_results
    }, expires_in: 5.minutes)

    enqueue_cover_refresh(project, results, ctx)
  end

  private

  # Piggyback on the repo data preflight already fetched: if the zine check passed, reuse the
  # shared context to find the zine URL (no second GitHub fetch / no re-running vision LLM) and
  # refresh the project cover. allow_representative: false keeps this strictly zine-driven.
  def enqueue_cover_refresh(project, results, ctx)
    zine = results.find { |r| r.key.to_s == "has_zine_page" }
    return unless zine&.passed?

    source_url = ShipChecks::UnifiedScreenshotFinder.find_url(project, ctx: ctx, allow_representative: false)
    ComputeProjectUnifiedThumbnailJob.perform_later(project.id, source_url: source_url) if source_url.present?
  rescue StandardError => e
    Rails.logger.warn("ShipPreflightJob cover refresh failed for project ##{project.id}: #{e.message}")
  end
end
