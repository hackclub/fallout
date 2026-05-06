class ShipUnifiedAirtableUploadJob < ApplicationJob
  queue_as :background

  def perform(ship_id)
    return unless ENV["AIRTABLE_API_KEY"].present?

    ship = Ship.find_by(id: ship_id)
    return unless ship&.approved?
    return if ship.user.trial?

    ship.upload_to_unified_airtable!
  rescue => e
    ErrorReporter.capture_exception(e, contexts: { ship_unified_airtable: { ship_id: ship_id } })
    raise e
  end
end
