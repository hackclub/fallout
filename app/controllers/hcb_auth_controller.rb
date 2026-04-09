# frozen_string_literal: true

class HcbAuthController < ApplicationController
  include OauthState

  before_action :require_admin! # Only admins can manage HCB connection — this handles real money
  skip_after_action :verify_authorized # No Pundit resource; admin-only access enforced by require_admin!
  skip_after_action :verify_policy_scoped # No scoped collection

  def start
    unless HcbService.configured?
      redirect_to root_path, alert: "HCB integration is not configured (HCB_CLIENT_ID not set)."
      return
    end

    state = SecureRandom.hex(24)
    # Store state in encrypted cookie to survive cross-site redirect (same pattern as HCA OAuth)
    existing = Array(cookies.encrypted[:hcb_oauth_state]).last(4)
    set_oauth_cookie(:hcb_oauth_state, existing + [ state ])

    redirect_to HcbService.authorize_url(hcb_redirect_uri, state:), allow_other_host: true
  end

  # HCB redirects here after authorization. In dev, this hits production first since the
  # redirect_uri is the prod URL. This page shows a chooser so you can bounce to localhost.
  # Once confirmed (or in production), it processes the token exchange.
  def callback
    if !params[:confirmed] && Rails.env.production?
      process_callback
    elsif params[:confirmed]
      process_callback
    else
      render_dev_chooser
    end
  end

  def destroy
    connection = HcbConnection.current
    if connection
      connection.disconnect!
      redirect_to root_path, notice: "HCB disconnected."
    else
      redirect_to root_path, alert: "No HCB connection to disconnect."
    end
  end

  private

  def process_callback
    valid_states = Array(cookies.encrypted[:hcb_oauth_state])
    delete_oauth_cookie(:hcb_oauth_state)

    unless valid_states.include?(params[:state])
      ErrorReporter.capture_message("HCB OAuth CSRF validation failed", level: :error)
      redirect_to root_path, alert: "HCB authentication failed due to CSRF token mismatch."
      return
    end

    token_data = HcbService.exchange_token(params[:code], hcb_redirect_uri)

    connection = HcbConnection.current || HcbConnection.new
    connection.update!(
      access_token: token_data[:access_token],
      refresh_token: token_data[:refresh_token],
      token_expires_at: Time.current + token_data[:expires_in].to_i.seconds,
      connected_by: current_user,
      connected_at: Time.current
    )

    redirect_to root_path, notice: "HCB connected successfully."
  rescue Faraday::Error => e
    ErrorReporter.capture_exception(e, contexts: { hcb: { event: "oauth_token_exchange_failure" } })
    redirect_to root_path, alert: "HCB connection failed. Please try again."
  end

  def render_dev_chooser
    query = { code: params[:code], state: params[:state], confirmed: 1 }.to_query
    prod_url = "https://fallout.hackclub.com/auth/hcb/callback?#{query}"
    local_url = "http://localhost:3000/auth/hcb/callback?#{query}"

    render html: <<~HTML.html_safe, layout: false
      <!DOCTYPE html>
      <html>
      <head><title>HCB OAuth</title></head>
      <body style="font-family: system-ui; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #1a1a1a; color: #e0e0e0;">
        <div style="text-align: center;">
          <h2>HCB Connected</h2>
          <p style="color: #999; margin-bottom: 2rem;">Where should we complete the connection?</p>
          <div style="display: flex; gap: 1rem;">
            <a href="#{ERB::Util.html_escape(prod_url)}" style="padding: 12px 24px; background: #333; color: #fff; text-decoration: none; border-radius: 8px;">Continue</a>
            <a href="#{ERB::Util.html_escape(local_url)}" style="padding: 12px 24px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 8px;">Continue (local dev)</a>
          </div>
        </div>
      </body>
      </html>
    HTML
  end

  def require_admin!
    raise ActionController::RoutingError, "Not Found" unless current_user&.admin?
  end

  # Always use the production URL as redirect_uri since that's what's registered on HCB's OAuth app.
  # In dev, use the chooser page to bounce back to localhost.
  def hcb_redirect_uri
    "https://fallout.hackclub.com/auth/hcb/callback"
  end
end
