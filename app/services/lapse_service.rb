require "faraday"
require "json"

module LapseService
  class Error < StandardError; end
  class Unauthorized < Error; end

  module_function

  def host
    "https://api.lapse.hackclub.com"
  end

  def authorize_url(redirect_uri, state, code_challenge:)
    params = {
      client_id: ENV.fetch("LAPSE_CLIENT_ID", nil),
      redirect_uri: redirect_uri,
      response_type: "code",
      scope: "user:read timelapse:read",
      state: state,
      code_challenge: code_challenge,
      code_challenge_method: "S256"
    }
    "#{host}/api/auth/authorize?#{params.to_query}"
  end

  def exchange_code_for_token(code, redirect_uri, code_verifier:)
    response = connection.post("/api/auth/token") do |req|
      req.headers["Content-Type"] = "application/x-www-form-urlencoded"
      req.body = {
        grant_type: "authorization_code",
        code: code,
        redirect_uri: redirect_uri,
        client_id: ENV.fetch("LAPSE_CLIENT_ID", nil),
        client_secret: ENV.fetch("LAPSE_CLIENT_SECRET", nil),
        code_verifier: code_verifier
      }.to_query
    end

    Rails.logger.debug("Lapse token exchange response: status=#{response.status} body=#{response.body.truncate(500)}")

    unless response.success?
      ErrorReporter.capture_message("Lapse token exchange failed", level: :error, contexts: {
        lapse: { status: response.status, body: response.body.truncate(500) }
      })
      return nil
    end

    JSON.parse(response.body)
  rescue StandardError => e
    ErrorReporter.capture_exception(e, contexts: { lapse: { action: "token_exchange" } })
    nil
  end

  def hackatime_projects(access_token)
    raise ArgumentError, "access_token is required" if access_token.blank?

    response = connection.get("/api/user/hackatimeProjects") do |req|
      req.headers["Authorization"] = "Bearer #{access_token}"
      req.headers["Accept"] = "application/json"
    end

    raise Unauthorized, "Lapse token expired or invalid" if response.status == 401

    unless response.success?
      ErrorReporter.capture_message("Lapse hackatime projects fetch failed", level: :warning, contexts: {
        lapse: { status: response.status }
      })
      return nil
    end

    data = JSON.parse(response.body)
    data.dig("data", "projects")
  rescue Unauthorized
    raise
  rescue StandardError => e
    ErrorReporter.capture_exception(e, contexts: { lapse: { action: "hackatime_projects" } })
    nil
  end

  def timelapses_for_project(access_token, project_key)
    raise ArgumentError, "access_token is required" if access_token.blank?
    raise ArgumentError, "project_key is required" if project_key.blank?

    response = connection.get("/api/hackatime/myTimelapsesForProject") do |req|
      req.headers["Authorization"] = "Bearer #{access_token}"
      req.headers["Accept"] = "application/json"
      req.params["projectKey"] = project_key
    end

    raise Unauthorized, "Lapse token expired or invalid" if response.status == 401

    unless response.success?
      ErrorReporter.capture_message("Lapse timelapses fetch failed", level: :warning, contexts: {
        lapse: { status: response.status, project_key: project_key }
      })
      return nil
    end

    data = JSON.parse(response.body)
    data.dig("data", "timelapses")
  rescue Unauthorized
    raise
  rescue StandardError => e
    ErrorReporter.capture_exception(e, contexts: { lapse: { action: "timelapses_for_project", project_key: project_key } })
    nil
  end

  def my_published_timelapses(access_token, limit: 100)
    raise ArgumentError, "access_token is required" if access_token.blank?

    all_timelapses = []
    cursor = nil

    loop do
      params = { limit: limit }
      params[:cursor] = cursor if cursor

      response = connection.get("/api/timelapse/myPublishedTimelapses") do |req|
        req.headers["Authorization"] = "Bearer #{access_token}"
        req.headers["Content-Type"] = "application/json"
        req.headers["Accept"] = "application/json"
        req.body = params.to_json
      end

      Rails.logger.debug("Lapse myPublishedTimelapses response: status=#{response.status} body=#{response.body.truncate(500)}")

      raise Unauthorized, "Lapse token expired or invalid" if response.status == 401

      unless response.success?
        ErrorReporter.capture_message("Lapse published timelapses fetch failed", level: :warning, contexts: {
          lapse: { status: response.status, body: response.body.truncate(500) }
        })
        return nil
      end

      data = JSON.parse(response.body)
      timelapses = data.dig("data", "timelapses") || []
      all_timelapses.concat(timelapses)

      cursor = data.dig("data", "nextCursor")
      break if cursor.nil?
    end

    all_timelapses
  rescue Unauthorized
    raise
  rescue StandardError => e
    ErrorReporter.capture_exception(e, contexts: { lapse: { action: "my_published_timelapses" } })
    nil
  end

  def query_user_by_email(email)
    raise ArgumentError, "email is required" if email.blank?

    key = program_key
    return nil if key.blank?

    response = connection.get("/api/user/queryByEmail") do |req|
      req.headers["Authorization"] = "Bearer #{key}"
      req.headers["Accept"] = "application/json"
      req.params["email"] = email
    end

    raise Unauthorized, "Lapse program key expired or invalid" if response.status == 401

    unless response.success?
      ErrorReporter.capture_message("Lapse user query by email failed", level: :warning, contexts: {
        lapse: { status: response.status }
      })
      return nil
    end

    data = JSON.parse(response.body)
    data.dig("data", "user")
  rescue Unauthorized
    raise
  rescue StandardError => e
    ErrorReporter.capture_exception(e, contexts: { lapse: { action: "query_user_by_email" } })
    nil
  end

  def find_timelapses_by_user(lapse_user_id)
    raise ArgumentError, "lapse_user_id is required" if lapse_user_id.blank?

    key = program_key
    return nil if key.blank?

    response = connection.get("/api/timelapse/findByUser") do |req|
      req.headers["Authorization"] = "Bearer #{key}"
      req.headers["Accept"] = "application/json"
      req.params["user"] = lapse_user_id
    end

    raise Unauthorized, "Lapse program key expired or invalid" if response.status == 401

    unless response.success?
      ErrorReporter.capture_message("Lapse find timelapses by user failed", level: :warning, contexts: {
        lapse: { status: response.status, lapse_user_id: lapse_user_id }
      })
      return nil
    end

    data = JSON.parse(response.body)
    data.dig("data", "timelapses")
  rescue Unauthorized
    raise
  rescue StandardError => e
    ErrorReporter.capture_exception(e, contexts: { lapse: { action: "find_timelapses_by_user", lapse_user_id: lapse_user_id } })
    nil
  end

  def fetch_timelapse(access_token, timelapse_id)
    raise ArgumentError, "timelapse_id is required" if timelapse_id.blank?

    response = connection.get("/api/timelapse/query") do |req|
      req.headers["Authorization"] = "Bearer #{access_token}" if access_token.present?
      req.headers["Accept"] = "application/json"
      req.params["id"] = timelapse_id
    end

    raise Unauthorized, "Lapse token expired or invalid" if response.status == 401

    unless response.success?
      ErrorReporter.capture_message("Lapse timelapse fetch failed", level: :warning, contexts: {
        lapse: { status: response.status, timelapse_id: timelapse_id }
      })
      return nil
    end

    data = JSON.parse(response.body)
    data.dig("data", "timelapse")
  rescue Unauthorized
    raise
  rescue StandardError => e
    ErrorReporter.capture_exception(e, contexts: { lapse: { action: "fetch_timelapse", timelapse_id: timelapse_id } })
    nil
  end

  def program_key
    ENV.fetch("LAPSE_PROGRAM_KEY", nil)
  end

  def connection
    @connection ||= Faraday.new(url: host) do |f|
      f.options.open_timeout = 5
      f.options.timeout = 10
    end
  end
end
