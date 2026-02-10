# frozen_string_literal: true

Sentry.init do |config|
  config.dsn = ENV["SENTRY_DSN"]
  config.breadcrumbs_logger = [ :active_support_logger, :http_logger ]

  config.send_default_pii = true

  config.environment = Rails.env.staging? ? "staging" : Rails.env
end
