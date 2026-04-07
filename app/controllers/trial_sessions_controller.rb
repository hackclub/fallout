class TrialSessionsController < ApplicationController
  allow_unauthenticated_access only: %i[create] # Unauthenticated users create trial sessions
  skip_onboarding_redirect only: %i[create] # Session creation happens before onboarding
  skip_after_action :verify_authorized # No authorizable resource on any action
  skip_after_action :verify_policy_scoped # No index action; no policy-scoped queries
  rate_limit to: 10, within: 3.minutes, only: :create, with: -> { redirect_to root_path, alert: "Try again later." }

  def create
    redirect_to path_path and return if user_signed_in? && !current_user.trial? # Verified users cannot create trial sessions

    email = params[:email].to_s.strip.downcase

    unless email.match?(URI::MailTo::EMAIL_REGEXP)
      redirect_to root_path, alert: "Please enter a valid email."
      return
    end

    if User.verified.exists?(email: email)
      # Inertia XHR cannot follow external redirects (CORS). Use Inertia's location redirect
      # so the client does window.location.href = url, letting the browser navigate natively.
      response.headers["X-Inertia-Location"] = signin_path(login_hint: email)
      head :conflict
      return
    end

    device_token = cookies.encrypted[:trial_device_token] || SecureRandom.hex(32)

    begin
      trial_user = TrialUser.find_or_create_from_device(email: email, device_token: device_token)
    rescue ActiveRecord::RecordInvalid
      # A verified user was created between the exists? check and create! (TOCTOU race)
      response.headers["X-Inertia-Location"] = signin_path(login_hint: email)
      head :conflict
      return
    end

    cookies.encrypted[:trial_device_token] = {
      value: device_token,
      httponly: true,
      secure: Rails.env.production?,
      same_site: :strict,
      expires: 1.year
    }

    session[:user_id] = trial_user.id
    redirect_to path_path
  end
end
