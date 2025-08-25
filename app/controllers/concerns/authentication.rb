# frozen_string_literal: true

module Authentication
  extend ActiveSupport::Concern

  included do
      before_action :set_current_user
      before_action :authenticate_user!
      helper_method :current_user, :user_signed_in?
  end

  class_methods do
    def allow_unauthenticated_access(only: nil)
      skip_before_action :authenticate_user!, only: only
    end
  end

  private

  def authenticate_user!
    unless current_user
      redirect_to root_path, alert: "You need to be logged in to see this!"
    end
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

  def terminate_session
    reset_session
  end
end
