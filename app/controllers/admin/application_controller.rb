class Admin::ApplicationController < ApplicationController
  before_action :require_admin!

  private

  def require_admin!
    unless current_user&.admin?
      redirect_to home_path, alert: "You are not authorized to access this page."
    end
  end
end
