class AuthController < ApplicationController
  allow_unauthenticated_access only: %i[new create]
  rate_limit to: 10, within: 3.minutes, only: :create, with: -> { redirect_to new_auth_url, alert: "Try again later." }

  def new
    state = SecureRandom.hex(24)
    session[:oauth_state] = state

    params = {
      client_id: ENV.fetch("HCA_CLIENT_ID"),
      redirect_uri: auth_callback_url,
      state: state,
      response_type: "code",
      scope: "openid profile email"
    }
    redirect_to "#{HCAService.host}/oauth/authorize?#{params.to_query}", allow_other_host: true
  end

  def create
    if params[:state] != session[:oauth_state]
      Rails.logger.tagged("Authentication") do
        Rails.logger.error({
          event: "csrf_validation_failed",
          expected_state: session[:oauth_state],
          received_state: params[:state]
        }.to_json)
      end
      session[:oauth_state] = nil
      redirect_to root_path, alert: "Authentication failed due to CSRF token mismatch"
      return
    end

    session[:oauth_state] = nil

    begin
      user = User.exchange_hca_token(params[:code], auth_callback_url)
      session[:user_id] = user.id

      Rails.logger.tagged("Authentication") do
        Rails.logger.info({
          event: "authentication_successful",
          user_id: user.id,
          hca_id: user.hca_id
        }.to_json)
      end

      redirect_to root_path, notice: "Welcome back, #{user.display_name}!"
    rescue StandardError => e
      Rails.logger.tagged("Authentication") do
        Rails.logger.error({
          event: "authentication_failed",
          error: e.message
        }.to_json)
      end
      redirect_to root_path, alert: e.message
    end
  end

  def destroy
    terminate_session
    redirect_to root_path, notice: "Signed out successfully. Cya!"
  end
end
