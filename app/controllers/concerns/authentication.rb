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
      helper_method :current_user, :user_signed_in?, :true_user, :impersonating?
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
    redirect_to signin_path(login_hint: current_user.email), alert: "Please verify your account to access this." if current_user&.trial?
  end

  def user_signed_in?
    current_user.present?
  end

  def set_current_user
    @current_user = User.find_by(id: session[:user_id]) if session[:user_id]
    # During admin impersonation `current_user` is the impersonated target (so the whole
    # request pipeline, Pundit, and the UI see exactly what that user would). The real admin
    # is tracked separately in `true_user` for audit attribution and the exit path.
    @true_user = session[:impersonator_id] ? User.find_by(id: session[:impersonator_id]) : @current_user
  end

  def current_user
    @current_user
  end

  # The actual human behind the request — the admin while impersonating, otherwise current_user.
  def true_user
    @true_user
  end

  def impersonating?
    session[:impersonator_id].present? && true_user.present? && true_user != current_user
  end

  # Attribute PaperTrail changes to the real human even while impersonating, so destructive
  # actions taken during an impersonation session trace back to the admin who performed them.
  def user_for_paper_trail
    true_user&.id
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
      redirect_to signin_path(login_hint: email), notice: "Your trial session has expired. Please sign in to continue."
    else
      redirect_to root_path, notice: "Your account is no longer active."
    end
  end

  def terminate_session
    # Preserve return_to across session reset so post-auth redirects survive the OAuth flow
    saved_return_to = session[:return_to]
    reset_session
    session[:return_to] = saved_return_to if saved_return_to.present?
  end

  def redirect_to_return_to_or(default_path, **options)
    target = session.delete(:return_to) || default_path
    redirect_to target, **options
  end
end
