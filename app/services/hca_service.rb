require "faraday"
require "json"

module HcaService
  class Error < StandardError; end

  TRANSIENT_NETWORK_ERRORS = [ Faraday::ConnectionFailed, Faraday::TimeoutError ].freeze

  module_function

  def host
    if Rails.env.production?
      "https://auth.hackclub.com"
    else
      "https://hca.dinosaurbbq.org"
    end
  end

  def backend_url(path = "")
    "#{host}/backend#{path}"
  end

  def scopes
    if Rails.env.production?
      "email name profile birthdate address verification_status slack_id"
    else
      "profile email name slack_id verification_status"
    end
  end

  def authorize_url(redirect_uri, state, login_hint: nil)
    params = {
      client_id: ENV.fetch("HCA_CLIENT_ID", nil),
      redirect_uri: redirect_uri,
      response_type: "code",
      scope: scopes,
      state: state
    }
    params[:login_hint] = login_hint if login_hint.present?
    "#{host}/oauth/authorize?#{params.to_query}"
  end

  def exchange_code_for_token(code, redirect_uri)
    response = connection.post("/oauth/token") do |req|
      req.headers["Content-Type"] = "application/x-www-form-urlencoded"
      req.body = {
        grant_type: "authorization_code",
        code: code,
        redirect_uri: redirect_uri,
        client_id: ENV.fetch("HCA_CLIENT_ID", nil),
        client_secret: ENV.fetch("HCA_CLIENT_SECRET", nil)
      }.to_query
    end

    unless response.success?
      ErrorReporter.capture_message("HCA token exchange failed", level: :error, contexts: {
        hca: { status: response.status, body: response.body.truncate(500) }
      })
      return nil
    end

    JSON.parse(response.body)
  rescue *TRANSIENT_NETWORK_ERRORS => e
    ErrorReporter.capture_exception(e, level: :warning, contexts: { hca: { action: "token_exchange" } })
    nil
  end

  def me(access_token)
    raise ArgumentError, "access_token is required" if access_token.blank?

    response = connection.get("/api/v1/me") do |req|
      req.headers["Authorization"] = "Bearer #{access_token}"
      req.headers["Accept"] = "application/json"
    end

    unless response.success?
      ErrorReporter.capture_message("HCA /me fetch failed", level: :warning, contexts: {
        hca: { status: response.status }
      })
      return nil
    end

    JSON.parse(response.body)
  rescue *TRANSIENT_NETWORK_ERRORS => e
    ErrorReporter.capture_exception(e, level: :warning, contexts: { hca: { action: "me" } })
    nil
  end

  def identity(access_token)
    result = me(access_token)
    result&.dig("identity") || {}
  end

  def portal_url(path, return_to:)
    uri = URI.join(host, "/portal/#{path}")
    uri.query = { return_to: return_to }.to_query
    uri.to_s
  end

  def address_portal_url(return_to:)
    portal_url("address", return_to:)
  end

  def verify_portal_url(return_to:)
    portal_url("verify", return_to:)
  end

  def connection
    @connection ||= Faraday.new(url: host)
  end
end
