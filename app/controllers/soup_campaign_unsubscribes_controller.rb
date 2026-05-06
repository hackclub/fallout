# Public unsubscribe endpoint — no authentication required, token-scoped.
# Allows any recipient to opt out of future Soup campaigns.
class SoupCampaignUnsubscribesController < ApplicationController
  allow_unauthenticated_access only: %i[show create] # Token is the auth mechanism
  skip_onboarding_redirect only: %i[show create] # Unsubscribe must work without an account
  skip_after_action :verify_authorized, only: %i[show create] # No Pundit subject; token-gated
  skip_after_action :verify_policy_scoped, only: %i[show create] # No collection query

  def show
    recipient = SoupCampaignRecipient.find_by(unsubscribe_token: params[:token])

    if recipient.nil?
      render inertia: "soup_campaign_unsubscribe/invalid"
      return
    end

    render inertia: "soup_campaign_unsubscribe/show", props: {
      campaign_name: recipient.soup_campaign.name,
      already_unsubscribed: recipient.unsubscribed?,
      token: params[:token]
    }
  end

  def create
    recipient = SoupCampaignRecipient.find_by(unsubscribe_token: params[:token])

    if recipient.nil?
      render inertia: "soup_campaign_unsubscribe/invalid"
      return
    end

    recipient.update!(status: :unsubscribed) unless recipient.unsubscribed?

    render inertia: "soup_campaign_unsubscribe/confirmed", props: {
      campaign_name: recipient.soup_campaign.name
    }
  end
end
