class ComputeProjectUnifiedThumbnailJob < ApplicationJob
  class TransientError < StandardError; end

  # Ops kill-switch: `Rails.cache.write("unified_thumbnail:paused", true)` makes every
  # run a no-op without a deploy. Useful if a downstream (GitHub, LLM, blob storage)
  # is on fire and we want to stop hammering it.
  PAUSE_CACHE_KEY = "unified_thumbnail:paused".freeze

  queue_as :background

  retry_on TransientError, wait: :polynomially_longer, attempts: 5

  # Serialize per project so concurrent triggers (ship approval + repo_link edit) don't
  # race on the same attachment. Duration is the abandon-the-lock timeout — generous
  # because libvips PDF rasterization plus HTTP timeouts can take ~30s in the worst case.
  limits_concurrency to: 1, key: ->(project_id) { "unified_thumbnail:#{project_id}" }, duration: 5.minutes

  def perform(project_id)
    return if Rails.cache.read(PAUSE_CACHE_KEY)

    project = Project.find_by(id: project_id)
    return if project.nil? || project.discarded?

    # repo_link cleared (or never set) — definitive removal, purge directly.
    if project.repo_link.blank?
      purge_attachment(project, reason: "repo_link blank")
      project.update_columns(
        unified_thumbnail_source_url: nil,
        unified_thumbnail_etag: nil,
        unified_thumbnail_checked_at: Time.current
      )
      return
    end

    source_url = ShipChecks::UnifiedScreenshotFinder.find_url(project)

    if source_url.present?
      refresh_from_source(project, source_url)
    else
      handle_finder_returned_nil(project)
    end
  end

  private

  # Finder gave us a URL — conditional GET fast-path when it matches the cached URL,
  # otherwise full download with no If-None-Match.
  def refresh_from_source(project, source_url)
    prior_etag = source_url == project.unified_thumbnail_source_url ? project.unified_thumbnail_etag : nil

    result = ShipChecks::UnifiedScreenshotProcessor.download_with_etag(source_url, if_none_match: prior_etag)

    case result[:status]
    when :unchanged
      project.update_columns(unified_thumbnail_checked_at: Time.current)
    when :changed
      attach_and_record(project, source_url, result[:bytes], result[:content_type], result[:etag])
    when :gone
      # Finder returned a URL but it 404s immediately — narrow race (file deleted between
      # finder and fetch). Treat as transient; next run's finder will likely return nil
      # and the probe path will handle the purge with positive proof.
      raise TransientError, "source #{source_url} returned 404 immediately after finder picked it"
    when :too_large
      Rails.logger.warn("ComputeProjectUnifiedThumbnailJob: source too large for project ##{project.id} (#{result[:size]} bytes), skipping")
      project.update_columns(unified_thumbnail_checked_at: Time.current)
    when :error
      raise TransientError, "fetch failed for #{source_url}: #{result[:detail]}"
    end
  end

  # Finder returned nil. Could be a real "no zine found" OR a silent transient failure
  # inside UnifiedScreenshotFinder / SharedContext (both swallow errors to nil). Never
  # purge an existing attachment without positive proof — probe the last known source
  # URL via conditional GET and act on the HTTP response.
  def handle_finder_returned_nil(project)
    unless project.unified_thumbnail.attached? && project.unified_thumbnail_source_url.present?
      project.update_columns(unified_thumbnail_checked_at: Time.current)
      return
    end

    result = ShipChecks::UnifiedScreenshotProcessor.download_with_etag(
      project.unified_thumbnail_source_url,
      if_none_match: project.unified_thumbnail_etag
    )

    case result[:status]
    when :unchanged
      # Old file still served — finder's nil was a hiccup, keep the cached attachment.
      project.update_columns(unified_thumbnail_checked_at: Time.current)
    when :changed
      # File still exists at the cached path but content moved on. Re-rasterize.
      attach_and_record(project, project.unified_thumbnail_source_url, result[:bytes], result[:content_type], result[:etag])
    when :gone
      # HTTP 404 — file is definitively removed from the repo. Safe to purge.
      purge_attachment(project, reason: "source URL 404")
      project.update_columns(
        unified_thumbnail_source_url: nil,
        unified_thumbnail_etag: nil,
        unified_thumbnail_checked_at: Time.current
      )
    when :too_large
      # Non-transient — the same oversized file will be oversized next hour.
      # Keep the cached attachment, log, advance checked_at so the project
      # leaves the stale set instead of churning every run.
      Rails.logger.warn("ComputeProjectUnifiedThumbnailJob: existing zine source too large for project ##{project.id} (#{result[:size]} bytes), keeping cached attachment")
      project.update_columns(unified_thumbnail_checked_at: Time.current)
    when :error
      # Transient — DNS, 5xx, timeout. Retry, never purge on uncertainty.
      raise TransientError, "couldn't verify existing zine for project ##{project.id}: #{result[:detail]}"
    end
  end

  def attach_and_record(project, source_url, bytes, content_type, etag)
    effective_type = ShipChecks::UnifiedScreenshotProcessor.resolve_content_type(content_type, source_url)
    unless ShipChecks::UnifiedScreenshotProcessor::SUPPORTED_CONTENT_TYPES.include?(effective_type)
      Rails.logger.warn("ComputeProjectUnifiedThumbnailJob: unsupported content_type=#{content_type} for project ##{project.id}, skipping")
      project.update_columns(unified_thumbnail_checked_at: Time.current)
      return
    end

    if effective_type == "application/pdf" && bytes.bytesize > ShipChecks::UnifiedScreenshotProcessor::MAX_PDF_INPUT_BYTES
      Rails.logger.warn("ComputeProjectUnifiedThumbnailJob: PDF too large for project ##{project.id} (#{bytes.bytesize} bytes), skipping")
      project.update_columns(unified_thumbnail_checked_at: Time.current)
      return
    end

    jpeg_bytes = ShipChecks::UnifiedScreenshotProcessor.transcode_to_jpeg(bytes, effective_type)
    unless jpeg_bytes
      Rails.logger.warn("ComputeProjectUnifiedThumbnailJob: transcode produced no bytes for project ##{project.id}")
      project.update_columns(unified_thumbnail_checked_at: Time.current)
      return
    end

    project.unified_thumbnail.attach(
      io: StringIO.new(jpeg_bytes),
      filename: "unified_thumbnail.jpg",
      content_type: "image/jpeg"
    )
    # update_columns skips after_commit chains — we don't want this thumbnail write to
    # re-trigger Meilisearch reindex or bulletin-board broadcasts on the project itself.
    project.update_columns(
      unified_thumbnail_source_url: source_url,
      unified_thumbnail_etag: etag,
      unified_thumbnail_checked_at: Time.current
    )
  end

  def purge_attachment(project, reason:)
    return unless project.unified_thumbnail.attached?
    Rails.logger.info("ComputeProjectUnifiedThumbnailJob: purging project ##{project.id} thumbnail (#{reason})")
    project.unified_thumbnail.purge_later
  end
end
