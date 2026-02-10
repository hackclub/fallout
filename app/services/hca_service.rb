require "faraday"
require "json"

module HcaService
  class Error < StandardError; end

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

  def authorize_url(redirect_uri, state)
    params = {
      client_id: ENV.fetch("HCA_CLIENT_ID", nil),
      redirect_uri: redirect_uri,
      response_type: "code",
      scope: scopes,
      state: state
    }
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
      Rails.logger.error("HCA token exchange failed: #{response.status} - #{response.body}")
      return nil
    end

    JSON.parse(response.body)
  rescue StandardError => e
    Rails.logger.error("HCA token exchange error: #{e.class}: #{e.message}")
    nil
  end

  def me(access_token)
    raise ArgumentError, "access_token is required" if access_token.blank?

    response = connection.get("/api/v1/me") do |req|
      req.headers["Authorization"] = "Bearer #{access_token}"
      req.headers["Accept"] = "application/json"
    end

    unless response.success?
      Rails.logger.warn("HCA /me fetch failed with status #{response.status}")
      return nil
    end

    JSON.parse(response.body)
  rescue StandardError => e
    Rails.logger.warn("HCA /me fetch error: #{e.class}: #{e.message}")
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
