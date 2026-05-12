# frozen_string_literal: true

# Broadcasts Rails.logger output to Better Stack in production. stdout is unchanged;
# Better Stack receives a copy via the logtail-rails gem's async HTTP shipper.
if Rails.env.production? && ENV["BETTER_STACK_SOURCE_TOKEN"].present?
  Rails.application.config.after_initialize do
    begin
      http_device = Logtail::LogDevices::HTTP.new(
        ENV["BETTER_STACK_SOURCE_TOKEN"],
        ingesting_host: ENV.fetch("BETTER_STACK_INGESTING_HOST")
      )
      better_stack_logger = Logtail::Logger.new(http_device)
      better_stack_logger.level = Rails.logger.level
      Rails.logger.broadcast_to(better_stack_logger)
    rescue StandardError => e
      Rails.logger.warn("Better Stack logger setup failed: #{e.class}: #{e.message}")
    end
  end
end
