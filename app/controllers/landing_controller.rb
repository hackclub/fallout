class LandingController < ApplicationController
  allow_unauthenticated_access only: %i[index]
  allow_trial_access only: %i[index]

  def index
    return redirect_to dashboard_path if user_signed_in?


  end
end
