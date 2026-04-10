class ApplicationController < ActionController::Base
  include Authentication
  include Pundit::Authorization
  include SentryContext
  include Pagy::Method
  include InertiaPagination

  before_action :set_paper_trail_whodunnit # Track who made changes in PaperTrail audit log
  before_action :sync_browser_timezone
  after_action :track_page_view

  after_action :verify_authorized, except: :index
  after_action :verify_policy_scoped, only: :index

  rescue_from Pundit::NotAuthorizedError, with: :user_not_authorized

  # Only allow modern browsers supporting webp images, web push, badges, import maps, CSS nesting, and CSS :has.
  # allow_browser versions: :modern

  inertia_share auth: -> {
    {
      user: current_user&.then { |u|
        {
          id: u.id,
          display_name: u.display_name,
          email: u.email,
          avatar: u.avatar,
          roles: u.roles,
          is_admin: u.admin?,
          is_staff: u.staff?,
          is_banned: u.is_banned,
          is_trial: u.trial?,
          is_onboarded: u.onboarded?
        }
      }
    }
  }
  inertia_share flash: -> { flash.to_hash }
  inertia_share sign_in_path: -> { signin_path(login_hint: current_user&.trial? ? current_user.email : nil) } # Prefill HCA email for trial users upgrading to full accounts
  inertia_share sign_out_path: -> { signout_path }
  inertia_share trial_session_path: -> { trial_session_path }
  inertia_share rsvp_path: -> { rsvp_path }
  inertia_share features: -> { # Feature flags for the frontend
    next {} unless current_user && !current_user.trial?
    {
      collaborators: Flipper.enabled?(:collaborators, current_user),
      shop: Flipper.enabled?(:shop, current_user)
    }
  }
  inertia_share has_unread_mail: -> { # Drives the envelope badge on the path page
    next false unless current_user && !current_user.trial?
    MailMessage.visible_to(current_user)
              .where.not(id: current_user.mail_interactions.read.select(:mail_message_id))
              .exists?
  }
  inertia_share current_streak: -> {
    next 0 unless current_user && !current_user.trial?
    StreakService.reconcile_missed_days(current_user) # Backfill freezes/misses so the streak is current
    StreakDay.current_streak(current_user)
  }
  inertia_share streak_freezes: -> {
    next 0 unless current_user && !current_user.trial?
    current_user.streak_freezes
  }

  private

  def track_page_view
    return if response.redirect?

    props = {
      controller: params[:controller],
      action: params[:action],
      user_id: current_user&.id
    }

    utm_params = request.query_parameters.slice("utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content")
    props.merge!(utm_params) if utm_params.present?

    ahoy.track "$view", props

    if user_signed_in? && ahoy.visit && ahoy.visit.user_id != current_user.id
      ahoy.visit.update(user_id: current_user.id)
    end
  end

  def collaborators_enabled?
    current_user && Flipper.enabled?(:collaborators, current_user)
  end
  helper_method :collaborators_enabled? # Available in views/Inertia props

  def sync_browser_timezone
    return unless current_user

    browser_tz = request.headers["X-Browser-Timezone"]
    return if browser_tz.blank?
    return if browser_tz == current_user.timezone
    return unless ActiveSupport::TimeZone[browser_tz] # Only accept valid IANA zone names

    current_user.update_column(:timezone, browser_tz) # Skip callbacks/validations — just a timezone sync
  end

  def user_not_authorized
    flash[:alert] = "You are not authorized to perform this action."
    redirect_back(fallback_location: root_path)
  end
end
