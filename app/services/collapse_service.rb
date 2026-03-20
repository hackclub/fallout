require "faraday"
require "json"

module CollapseService
  class Error < StandardError; end

  module_function

  def host
    ENV.fetch("COLLAPSE_URL", "https://collapse.b.selfhosted.hackclub.com")
  end

  def api_key
    ENV.fetch("COLLAPSE_API_KEY")
  end

  def create_session(metadata: {})
    response = internal_connection.post("/api/internal/sessions") do |req|
      req.headers["Content-Type"] = "application/json"
      req.body = { metadata: metadata }.to_json
    end

    unless response.success?
      ErrorReporter.capture_message("Collapse session creation failed", level: :error, contexts: {
        collapse: { status: response.status, body: response.body.truncate(500) }
      })
      return nil
    end

    JSON.parse(response.body)
  rescue StandardError => e
    ErrorReporter.capture_exception(e, contexts: { collapse: { action: "create_session" } })
    nil
  end

  def get_session(token)
    raise ArgumentError, "token is required" if token.blank?

    response = public_connection.get("/api/sessions/#{token}")

    unless response.success?
      ErrorReporter.capture_message("Collapse session fetch failed", level: :warning, contexts: {
        collapse: { status: response.status }
      })
      return nil
    end

    JSON.parse(response.body)
  rescue StandardError => e
    ErrorReporter.capture_exception(e, contexts: { collapse: { action: "get_session" } })
    nil
  end

  def get_video_url(token)
    raise ArgumentError, "token is required" if token.blank?

    response = public_connection.get("/api/sessions/#{token}/video")
    return nil unless response.success?

    JSON.parse(response.body)
  rescue StandardError => e
    ErrorReporter.capture_exception(e, contexts: { collapse: { action: "get_video_url" } })
    nil
  end

  def get_thumbnail_url(token)
    raise ArgumentError, "token is required" if token.blank?

    response = public_connection.get("/api/sessions/#{token}/thumbnail")
    return nil unless response.success?

    JSON.parse(response.body)
  rescue StandardError => e
    ErrorReporter.capture_exception(e, contexts: { collapse: { action: "get_thumbnail_url" } })
    nil
  end

  def batch_sessions(tokens)
    raise ArgumentError, "tokens are required" if tokens.blank?

    response = public_connection.post("/api/sessions/batch") do |req|
      req.headers["Content-Type"] = "application/json"
      req.body = { tokens: tokens }.to_json
    end

    unless response.success?
      ErrorReporter.capture_message("Collapse batch fetch failed", level: :warning, contexts: {
        collapse: { status: response.status }
      })
      return nil
    end

    data = JSON.parse(response.body)
    data["sessions"]
  rescue StandardError => e
    ErrorReporter.capture_exception(e, contexts: { collapse: { action: "batch_sessions" } })
    nil
  end

  def public_connection
    @public_connection ||= Faraday.new(url: host) do |f|
      f.options.open_timeout = 5
      f.options.timeout = 10
    end
  end

  def internal_connection
    @internal_connection ||= Faraday.new(url: host) do |f|
      f.options.open_timeout = 5
      f.options.timeout = 10
      f.headers["X-API-Key"] = api_key
    end
  end
end
