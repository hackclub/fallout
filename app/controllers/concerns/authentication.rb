# frozen_string_literal: true

module Authentication
  extend ActiveSupport::Concern

  included do
      before_action :set_current_user
      before_action :authenticate_user!
      before_action :redirect_banned_user!
      before_action :redirect_discarded_trial_user!
      before_action :authenticate_verified_user!
      before_action :redirect_to_onboarding!
      helper_method :current_user, :user_signed_in?
  end

  class_methods do
    def allow_unauthenticated_access(only: nil)
      skip_before_action :authenticate_user!, only: only
    end

    def allow_trial_access(only: nil)
      skip_before_action :authenticate_verified_user!, only: only
    end

    def skip_onboarding_redirect(only: nil)
      skip_before_action :redirect_to_onboarding!, only: only
    end
  end

  private

  def authenticate_user!
    unless current_user
      redirect_to root_path, alert: "You need to be logged in to see this!"
    end
  end

  def authenticate_verified_user!
    redirect_to signin_path(login_hint: current_user.email, signup: true), alert: "Please verify your account to access this." if current_user&.trial?
  end

  def user_signed_in?
    current_user.present?
  end

  def set_current_user
    @current_user = User.find_by(id: session[:user_id]) if session[:user_id]
  end

  def current_user
    @current_user
  end

  def redirect_banned_user!
    redirect_to sorry_path if current_user&.is_banned?
  end

  def redirect_to_onboarding!
    redirect_to onboarding_path if current_user&.needs_onboarding?
  end

  def redirect_discarded_trial_user!
    return unless current_user&.discarded?

    is_trial = current_user.trial?
    email = current_user.email
    @current_user = nil
    terminate_session

    if is_trial
      cookies.delete(:trial_device_token)
      redirect_to signin_path(login_hint: email, signup: true), notice: "Your trial session has expired. Please sign in to continue."
    else
      redirect_to root_path, notice: "Your account is no longer active."
    end
  end

  def terminate_session
    reset_session
  end
end
