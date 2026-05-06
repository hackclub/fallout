# frozen_string_literal: true

Sentry.init do |config|
  config.dsn = ENV["SENTRY_DSN"]
  config.breadcrumbs_logger = [ :active_support_logger, :http_logger ]

  config.send_default_pii = true

  config.environment = Rails.env.staging? ? "staging" : Rails.env

  # Tie events to the same git SHA the Vite plugin uses for source map uploads
  config.release = ENV["SENTRY_RELEASE"].presence

  # Performance monitoring — matches frontend tracesSampleRate so end-to-end traces line up
  config.traces_sample_rate = Rails.env.production? ? 0.2 : 1.0
  config.profiles_sample_rate = Rails.env.production? ? 0.2 : 1.0 # CPU profiles via stackprof
end
