class TrackingRedirectsController < ApplicationController
  # Public vanity URLs for adblocker-safe tracking — no authorizable resource
  allow_unauthenticated_access only: %i[show]
  allow_trial_access only: %i[show]
  skip_onboarding_redirect only: %i[show]
  skip_after_action :verify_authorized # No index action on this controller
  skip_after_action :verify_policy_scoped # No index action on this controller

  # Maps path slug to source name and destination.
  # Path and source can differ (e.g., slug "go" could track source "newsletter").
  TRACKING_PATHS = {
    "infill" => { source: "infill", destination: "/" },
    "rmrrf" => { source: "infill", destination: "/" },
    "infill-2026" => { source: "infill", destination: "/" },
    "rmrrf-2026" => { source: "infill", destination: "/" }
  }.freeze

  def show
    config = TRACKING_PATHS[params[:slug]]
    return head :not_found unless config

    # Tag the Ahoy visit directly — bypasses utm_source query params that adblockers strip
    if ahoy.visit && ahoy.visit.utm_source.blank?
      ahoy.visit.update(utm_source: config[:source])
    end

    redirect_to config[:destination], allow_other_host: false
  end
end
