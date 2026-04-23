# frozen_string_literal: true

require "faraday"

module HcbService
  class Error < StandardError; end
  class NotConfiguredError < Error; end

  module_function

  def configured?
    ENV["HCB_CLIENT_ID"].present?
  end

  ORGANIZATION_ID = "org_vgu6Nl"

  def host
    ENV.fetch("HCB_OAUTH_HOST", "https://hcb.hackclub.com").chomp("/")
  end

  def authorize_url(redirect_uri, state:)
    ensure_configured!

    params = {
      client_id: ENV.fetch("HCB_CLIENT_ID"),
      redirect_uri: redirect_uri,
      response_type: "code",
      scope: "read",
      state: state
    }

    "#{host}/api/v4/oauth/authorize?#{params.to_query}"
  end

  def exchange_token(code, redirect_uri)
    ensure_configured!

    response = connection.post("/api/v4/oauth/token") do |req|
      req.headers["Content-Type"] = "application/x-www-form-urlencoded"
      req.body = URI.encode_www_form({
        client_id: ENV.fetch("HCB_CLIENT_ID"),
        client_secret: ENV.fetch("HCB_CLIENT_SECRET"),
        redirect_uri: redirect_uri,
        code: code,
        grant_type: "authorization_code"
      })
    end

    response.body
  end

  def refresh_token(refresh_token)
    ensure_configured!
    raise ArgumentError, "refresh_token is required" unless refresh_token.present?

    response = connection.post("/api/v4/oauth/token") do |req|
      req.headers["Content-Type"] = "application/x-www-form-urlencoded"
      req.body = URI.encode_www_form({
        client_id: ENV.fetch("HCB_CLIENT_ID"),
        client_secret: ENV.fetch("HCB_CLIENT_SECRET"),
        refresh_token: refresh_token,
        grant_type: "refresh_token"
      })
    end

    response.body
  end

  # Writes to HCB mutate real money state, so they are gated off by default in non-prod.
  # Set HCB_ALLOW_WRITES=true (or 1/yes/t/y) to opt in for a given non-prod environment.
  def writes_allowed?
    Rails.env.production? || ActiveModel::Type::Boolean.new.cast(ENV["HCB_ALLOW_WRITES"])
  end

  # Returns `stub` and logs a warning if writes are disabled in the current env;
  # returns nil (falsey) if writes are allowed, meaning callers should proceed.
  def noop_write(op, stub)
    return nil if writes_allowed?

    Rails.logger.warn(
      "[HcbService] NOOP (#{op}) in #{Rails.env} — set HCB_ALLOW_WRITES=true to enable real HCB writes"
    )
    stub
  end

  # === Card Grant API Methods ===

  def list_card_grants
    authenticated_connection.get(
      "/api/v4/organizations/#{ORGANIZATION_ID}/card_grants",
      { expand: "balance_cents" }
    ).body
  end

  def get_card_grant(card_grant_id)
    authenticated_connection.get(
      "/api/v4/card_grants/#{card_grant_id}",
      { expand: "balance_cents" }
    ).body
  end

  def create_card_grant(params)
    stub = noop_write(:create_card_grant, {
      id: "stub_cg_#{SecureRandom.hex(6)}",
      email: params[:email],
      card_id: nil,
      expires_on: params[:expiration_at],
      status: "active"
    })
    return stub if stub

    authenticated_connection.post(
      "/api/v4/organizations/#{ORGANIZATION_ID}/card_grants"
    ) do |req|
      req.headers["Content-Type"] = "application/json"
      req.body = params.to_json
    end.body
  end

  def cancel_card_grant(card_grant_id)
    stub = noop_write(:cancel_card_grant, { id: card_grant_id, status: "canceled" })
    return stub if stub

    authenticated_connection.post(
      "/api/v4/card_grants/#{card_grant_id}/cancel"
    ).body
  end

  def topup_card_grant(card_grant_id, amount_cents:)
    stub = noop_write(:topup_card_grant, { id: card_grant_id, amount_cents: amount_cents })
    return stub if stub

    authenticated_connection.post(
      "/api/v4/card_grants/#{card_grant_id}/topup"
    ) do |req|
      req.headers["Content-Type"] = "application/json"
      req.body = { amount_cents: amount_cents }.to_json
    end.body
  end

  def withdraw_card_grant(card_grant_id, amount_cents:)
    stub = noop_write(:withdraw_card_grant, { id: card_grant_id, amount_cents: amount_cents })
    return stub if stub

    authenticated_connection.post(
      "/api/v4/card_grants/#{card_grant_id}/withdraw"
    ) do |req|
      req.headers["Content-Type"] = "application/json"
      req.body = { amount_cents: amount_cents }.to_json
    end.body
  end

  def activate_card_grant(card_grant_id)
    stub = noop_write(:activate_card_grant, { id: card_grant_id, status: "active" })
    return stub if stub

    authenticated_connection.post(
      "/api/v4/card_grants/#{card_grant_id}/activate"
    ).body
  end

  # === Transaction API Methods ===

  def list_card_grant_transactions(card_grant_id, after: nil)
    params = { limit: 100 }
    params[:after] = after if after

    authenticated_connection.get(
      "/api/v4/card_grants/#{card_grant_id}/transactions", params
    ).body
  end

  # === Private Helpers ===

  def ensure_configured!
    raise NotConfiguredError, "HCB integration not configured (HCB_CLIENT_ID not set)" unless configured?
  end

  def access_token
    conn = HcbConnection.current
    raise Error, "No HCB connection configured" unless conn&.access_token.present?
    raise Error, "HCB token expired" if conn.token_expired?

    conn.access_token
  end

  def connection
    @connection ||= Faraday.new(
      url: host,
      request: { timeout: 10, open_timeout: 5 }
    ) do |f|
      f.response :json, parser_options: { symbolize_names: true }
      f.response :raise_error
    end
  end

  def authenticated_connection
    Faraday.new(
      url: host,
      request: { timeout: 10, open_timeout: 5 }
    ) do |f|
      f.request :authorization, "Bearer", -> { access_token }
      f.response :json, parser_options: { symbolize_names: true }
      f.response :raise_error
    end
  end

  private_class_method :ensure_configured!, :connection, :access_token, :authenticated_connection
end
