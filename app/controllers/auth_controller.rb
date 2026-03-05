class AuthController < ApplicationController
  allow_unauthenticated_access only: %i[new create] # OAuth flow must work without a session
  allow_trial_access only: %i[new create destroy] # Trial users can upgrade to HCA or sign out
  skip_onboarding_redirect only: %i[new create destroy] # Auth flow must complete before onboarding can run
  skip_after_action :verify_authorized # No authorizable resource on any action
  skip_after_action :verify_policy_scoped # No index action; no policy-scoped queries
  skip_before_action :redirect_banned_user!, only: %i[destroy] # Banned users must be able to sign out
  rate_limit to: 10, within: 3.minutes, only: :create, with: -> { redirect_to signin_path, alert: "Try again later." }

  def new
    state = SecureRandom.hex(24)
    session[:state] = state

    redirect_to HcaService.authorize_url(hca_callback_url, state, login_hint: params[:login_hint]), allow_other_host: true
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
        if current_user.email != user.email
          redirect_to dashboard_path, alert: "This email already has an account! Please sign out and log in with HCA."
          return
        end

        ActiveRecord::Base.transaction do
          current_user.projects.update_all(user_id: user.id)
          existing_keys = user.onboarding_responses.pluck(:question_key)
          current_user.onboarding_responses.where.not(question_key: existing_keys).update_all(user_id: user.id)
          user.update!(onboarded: true) if current_user.onboarded? && !user.onboarded?
        end
        cookies.delete(:trial_device_token)
      end

      TrialUser.kept.where(email: user.email).update_all(discarded_at: Time.current)

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
      redirect_to root_path, alert: "Authentication failed. Please try again."
    end
  end

  def destroy
    terminate_session
    redirect_to root_path, notice: "Signed out successfully. Cya!"
  end
end
