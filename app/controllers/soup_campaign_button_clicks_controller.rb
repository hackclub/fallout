# Public landing for soup campaign button links — no authentication required, signed-token-scoped.
# The token (SoupCampaign.button_click_verifier) identifies the campaign, button and recipient's Slack ID.
class SoupCampaignButtonClicksController < ApplicationController
  allow_unauthenticated_access only: %i[show] # Signed token is the auth mechanism
  skip_onboarding_redirect only: %i[show] # Recipients may not have an account
  skip_after_action :verify_authorized # No Pundit subject; token-gated. Blanket: no index action (Rails raises on only: :index otherwise)
  skip_after_action :verify_policy_scoped # No collection query. Blanket: no index action

  def show
    campaign_id, index, slack_id = SoupCampaign.button_click_verifier.verified(params[:token], purpose: :soup_button_click)
    campaign = SoupCampaign.find_by(id: campaign_id)
    button = campaign&.buttons&.[](index)
    return render inertia: "soup_campaign_button/show", props: { status: "invalid" } if button.blank?

    ok = button["webhook_url"].blank? || SoupCampaignButtonWebhook.deliver(campaign, index, slack_id)
    # Button URLs are admin-set (http(s) only, validated in SoupCampaign.validate_button!) and the token is signed.
    return redirect_to(button["url"], allow_other_host: true) if ok && button["url"].present?

    render inertia: "soup_campaign_button/show", props: { status: ok ? "done" : "failed", button_label: button["label"] }
  end
end
