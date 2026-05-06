# Marks a campaign as fully sent once all recipients have been processed.
# Called after a delay by SendSoupCampaignJob. If any recipients are still
# pending (e.g., due to a server restart during sending), re-enqueues them.
class FinalizeSoupCampaignJob < ApplicationJob
  queue_as :default

  def perform(campaign_id)
    campaign = SoupCampaign.find_by(id: campaign_id)
    return unless campaign&.sending?

    pending_count = campaign.soup_campaign_recipients.unsent.count

    if pending_count > 0
      # Some recipients haven't been processed yet — re-trigger sending
      SendSoupCampaignJob.perform_later(campaign_id)
    else
      campaign.update!(status: :sent, sent_at: Time.current)
    end
  end
end
