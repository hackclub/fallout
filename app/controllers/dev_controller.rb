class DevController < ApplicationController
  allow_unauthenticated_access only: :login # Dev-only bypass; route only exists in development
  skip_onboarding_redirect only: :login
  skip_after_action :verify_authorized
  skip_after_action :verify_policy_scoped

  def login
    raise "Not available in production" unless Rails.env.development?

    user = User.find(params[:id])
    terminate_session
    session[:user_id] = user.id
    redirect_to root_path, notice: "Signed in as #{user.display_name}"
  end
end
