class TrialSessionsController < ApplicationController
  allow_unauthenticated_access only: %i[create]
  rate_limit to: 1, within: 10.minutes, only: :create, with: -> { redirect_to root_path, alert: "Try again later." }

  def create
    email = params[:email].to_s.strip.downcase

    unless email.match?(URI::MailTo::EMAIL_REGEXP)
      redirect_to root_path, alert: "Please enter a valid email."
      return
    end

    if User.verified.exists?(email: email)
      redirect_to signin_path
      return
    end

    device_token = cookies.encrypted[:trial_device_token] || SecureRandom.hex(32)
    trial_user = TrialUser.find_or_create_from_device(email: email, device_token: device_token)

    cookies.encrypted[:trial_device_token] = {
      value: device_token,
      httponly: true,
      secure: Rails.env.production?,
      expires: 1.year
    }

    session[:user_id] = trial_user.id
    redirect_to projects_path, notice: "Welcome! Create your first project to get started."
  end
end
