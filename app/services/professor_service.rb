require "faraday"
require "json"

module ProfessorService
  class Error < StandardError; end
  class ConfigError < Error; end

  TRANSIENT_NETWORK_ERRORS = [ Faraday::ConnectionFailed, Faraday::TimeoutError ].freeze
  HOST = "https://professor.tanishqg.hackclub.app".freeze

  module_function

  # Adds the user identified by `slack_id` to the Professors Slack channel via the Professor
  # bot's manual-add endpoint. Returns true on success, false on a non-2xx response or transient
  # network failure (already reported to Sentry). Raises ConfigError if PROFESSOR_API_SECRET is
  # not configured — that's a misconfiguration, not a runtime failure, and should surface loudly.
  def manual_add(slack_id:)
    raise ArgumentError, "slack_id is required" if slack_id.blank?

    secret = ENV["PROFESSOR_API_SECRET"]
    raise ConfigError, "PROFESSOR_API_SECRET is not set" if secret.blank?

    response = connection.post("/manual-add") do |req|
      req.headers["Content-Type"] = "application/json"
      req.body = { user_id: slack_id, secret: secret }.to_json
    end

    return true if response.success?

    # Redact the secret before reporting in case the Professor API echoes the request body in
    # its error response — we never want PROFESSOR_API_SECRET in Sentry breadcrumbs. Cap the
    # body before the gsub to bound work on large upstream responses; include a secret-length
    # buffer so a secret that straddles the truncation boundary still matches and gets redacted.
    sanitized_body = response.body.to_s
      .truncate(500 + secret.length, omission: "")
      .gsub(secret, "[REDACTED]")
      .truncate(500)
    ErrorReporter.capture_message("Professor manual-add failed", level: :warning, contexts: {
      professor: { status: response.status, body: sanitized_body }
    })
    false
  rescue *TRANSIENT_NETWORK_ERRORS => e
    ErrorReporter.capture_exception(e, level: :warning, contexts: { professor: { action: "manual_add" } })
    false
  end

  def connection
    @connection ||= Faraday.new(url: HOST, request: { timeout: 10, open_timeout: 5 })
  end
end
