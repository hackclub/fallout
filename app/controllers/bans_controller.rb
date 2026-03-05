class BansController < ApplicationController
  allow_trial_access only: %i[show] # Banned trial users must see ban notice
  skip_onboarding_redirect only: %i[show] # Ban notice takes priority over onboarding
  skip_before_action :redirect_banned_user!, only: %i[show] # This IS the ban destination
  skip_after_action :verify_authorized # No authorizable resource on any action
  skip_after_action :verify_policy_scoped # No index action; no policy-scoped queries

  def show
    redirect_to root_path unless current_user&.is_banned?
  end
end
