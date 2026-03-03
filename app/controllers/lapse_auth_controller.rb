class LapseAuthController < ApplicationController
  skip_onboarding_redirect
  rate_limit to: 10, within: 3.minutes, only: :callback, with: -> { redirect_to root_path, alert: "Try again later." }

  def start
    state = SecureRandom.hex(24)
    session[:lapse_state] = state

    redirect_to LapseService.authorize_url(lapse_callback_url, state), allow_other_host: true
  end

  def callback
    if params[:state] != session[:lapse_state]
      ErrorReporter.capture_message("Lapse CSRF validation failed", level: :error, contexts: {
        lapse_auth: { expected_state: session[:lapse_state], received_state: params[:state] }
      })
      session[:lapse_state] = nil
      redirect_to root_path, alert: "Lapse authentication failed due to CSRF token mismatch"
      return
    end

    session[:lapse_state] = nil

    token_data = LapseService.exchange_code_for_token(params[:code], lapse_callback_url)
    unless token_data&.dig("access_token")
      redirect_to root_path, alert: "Failed to connect Lapse account"
      return
    end

    current_user.update!(lapse_token: token_data["access_token"])
    redirect_to root_path, notice: "Lapse account connected successfully!"
  rescue StandardError => e
    ErrorReporter.capture_exception(e)
    redirect_to root_path, alert: "Failed to connect Lapse account"
  end
end
