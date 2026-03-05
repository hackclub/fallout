class LandingController < ApplicationController
  allow_unauthenticated_access only: %i[index] # Public landing page
  allow_trial_access only: %i[index] # Trial users see landing before redirect to dashboard
  skip_onboarding_redirect only: %i[index] # Landing page redirects signed-in users itself
  skip_after_action :verify_authorized, only: %i[index] # No authorizable resource
  skip_after_action :verify_policy_scoped, only: %i[index] # No scoped collection

  def index
    return redirect_to dashboard_path if user_signed_in?
  end
end
