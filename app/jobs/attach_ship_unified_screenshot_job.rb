class AttachShipUnifiedScreenshotJob < ApplicationJob
  queue_as :background

  class AirtableRecordNotReadyError < StandardError; end

  # Retry while the parallel ShipUnifiedAirtableUploadJob hasn't yet created
  # the Airtable record we need to attach to. ~2 minutes total wait.
  retry_on AirtableRecordNotReadyError, wait: 15.seconds, attempts: 8

  def perform(ship_id)
    return unless ENV["AIRTABLE_API_KEY"].present?

    ship = Ship.find_by(id: ship_id)
    return unless ship&.approved?
    return if ship.user.trial?

    # Skip if we've already attached for this ship — uploadAttachment APPENDS,
    # so a repeat would create a duplicate screenshot in the field.
    screenshot_marker_id = "#{ship.unified_airtable_identifier}/screenshot"
    return if AirtableSync.where(record_identifier: screenshot_marker_id).where.not(last_synced_at: nil).exists?

    sync_row = AirtableSync.find_by(record_identifier: ship.unified_airtable_identifier)
    raise AirtableRecordNotReadyError, "Awaiting unified upload to create Airtable record for Ship##{ship_id}" if sync_row&.airtable_id.blank?

    # Cache the source URL on ship.frozen_screenshot so retries don't re-run
    # the LLM stages. A nil result isn't cached — finder will re-run, which
    # is fine since the fastest path (filename regex over the tree) is cheap.
    if ship.frozen_screenshot.blank?
      source_url = ShipChecks::UnifiedScreenshotFinder.find_url(ship.project)
      ship.update_column(:frozen_screenshot, source_url) if source_url.present?
    end

    source_url = ship.frozen_screenshot
    return if source_url.blank?

    jpeg_bytes = ShipChecks::UnifiedScreenshotProcessor.process(source_url)
    return if jpeg_bytes.blank?

    AirtableSync.upload_attachment!(
      record_id: sync_row.airtable_id,
      field_name: "Screenshot",
      filename: "screenshot.jpg",
      content_type: "image/jpeg",
      bytes: jpeg_bytes
    )

    AirtableSync.find_or_initialize_by(record_identifier: screenshot_marker_id)
                .update!(last_synced_at: Time.current)
  rescue AirtableRecordNotReadyError
    raise
  rescue => e
    ErrorReporter.capture_exception(e, contexts: { attach_ship_unified_screenshot: { ship_id: ship_id } })
    raise e
  end
end
