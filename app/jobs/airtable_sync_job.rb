class AirtableSyncJob < ApplicationJob
  queue_as :background

  CLASSES_TO_SYNC = %w[User Project ShopOrder].freeze

  def perform
    return unless ENV["AIRTABLE_API_KEY"].present?

    CLASSES_TO_SYNC.each do |classname|
      AirtableSyncClassJob.perform_later(classname)
    end
  end
end
