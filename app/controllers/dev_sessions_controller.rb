class DevSessionsController < ApplicationController
  # Dev-only login bypass — skips HCA OAuth entirely.
  # Only mounted in development (see routes.rb).
  allow_unauthenticated_access only: %i[create]
  allow_trial_access only: %i[create]
  skip_onboarding_redirect only: %i[create]
  skip_after_action :verify_authorized
  skip_after_action :verify_policy_scoped

  def create
    user = User.kept.find_by(id: params[:user_id])
    unless user
      redirect_to root_path, alert: "User not found."
      return
    end

    terminate_session
    session[:user_id] = user.id
    redirect_to root_path, notice: "Signed in as #{user.display_name} (dev bypass)."
  end
end
