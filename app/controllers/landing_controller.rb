class LandingController < ApplicationController
  allow_unauthenticated_access only: %i[index]

  def index
    if user_authenticated?
      redirect_to home_path
    end
    # This will render app/views/landing/index.html.erb by default
  end
end
