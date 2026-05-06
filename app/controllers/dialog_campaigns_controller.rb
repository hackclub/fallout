class DialogCampaignsController < ApplicationController
  skip_after_action :verify_authorized # No index action — blanket skip required (Rails 8.1 callback validation)
  skip_after_action :verify_policy_scoped # No index action — blanket skip required (Rails 8.1 callback validation)

  def mark_seen
    campaign = current_user.dialog_campaigns.unseen.find_by!(key: params[:key])
    authorize campaign
    campaign.mark_seen!

    head :no_content
  end
end
