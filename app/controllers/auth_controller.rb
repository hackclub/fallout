class AuthController < ApplicationController
  allow_unauthenticated_access only: %i[new create]
  allow_trial_access only: %i[new create destroy]
  skip_before_action :redirect_banned_user!, only: %i[destroy]
  rate_limit to: 10, within: 3.minutes, only: :create, with: -> { redirect_to signin_path, alert: "Try again later." }

  def new
    state = SecureRandom.hex(24)
    session[:state] = state

    redirect_to HcaService.authorize_url(hca_callback_url, state), allow_other_host: true
  end

  def create
    if params[:state] != session[:state]
      ErrorReporter.capture_message("Authentication CSRF validation failed", level: :error, contexts: {
        authentication: { expected_state: session[:state], received_state: params[:state] }
      })
      session[:state] = nil
      redirect_to root_path, alert: "Authentication failed due to CSRF token mismatch"
      return
    end

    begin
      user = User.exchange_hca_token(params[:code], hca_callback_url)

      if current_user&.trial?
        current_user.projects.update_all(user_id: user.id)
        cookies.delete(:trial_device_token)
      end

      TrialUser.kept.where(email: user.email).discard_all

      terminate_session
      session[:user_id] = user.id

      Rails.logger.tagged("Authentication") do
        Rails.logger.info({
          event: "authentication_successful",
          user_id: user.id,
          email: user.email
        }.to_json)
      end

      redirect_to root_path, notice: "Welcome back, #{user.display_name}!"
    rescue StandardError => e
      ErrorReporter.capture_exception(e)
      redirect_to root_path, alert: e.message
    end
  end

  def destroy
    terminate_session
    redirect_to root_path, notice: "Signed out successfully. Cya!"
  end
end
