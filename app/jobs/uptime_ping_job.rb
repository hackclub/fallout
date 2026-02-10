class UptimePingJob < ApplicationJob
  queue_as :uptime

  def perform
    url = ENV["UPTIME_WORKER_PING_URL"]
    unless url.present?
      Rails.logger.warn "UPTIME_WORKER_PING_URL not set, skipping uptime ping"
      return
    end

    begin
      response = Faraday.get(url)

      if response.success?
        Rails.logger.info "Uptime ping successful: #{response.status}"
      else
        Rails.logger.warn "Uptime ping failed with status: #{response.status}"
      end
    rescue => e
      Rails.logger.error "Uptime ping error: #{e.message}"
      # Don't re-raise to avoid job failure - we'll try again in 60 seconds
    end
  end
end
