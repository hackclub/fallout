# Orchestrates sending a Soup campaign. Safe to re-enqueue on server restart —
# it skips recipients that are already sent/failed/skipped and only enqueues
# pending ones. This makes the whole send durable across restarts.
class SendSoupCampaignJob < ApplicationJob
  queue_as :default

  def perform(campaign_id)
    campaign = SoupCampaign.find_by(id: campaign_id)
    return unless campaign
    return if campaign.sent? || campaign.cancelled?

    campaign.update!(status: :sending) if campaign.draft?

    # Build recipient list if not already built
    populate_recipients(campaign)

    # Enqueue a job for each pending recipient
    campaign.soup_campaign_recipients.unsent.find_each do |recipient|
      SendSoupCampaignMessageJob.perform_later(recipient.id)
    end

    # Schedule a finalization check once all messages have had time to process
    FinalizeSoupCampaignJob.set(wait: 5.minutes).perform_later(campaign_id)
  end

  private

  def populate_recipients(campaign)
    campaign.projected_recipients.each do |recipient|
      campaign.soup_campaign_recipients.find_or_create_by!(slack_id: recipient[:slack_id]) do |r|
        r.display_name = recipient[:display_name]
        r.status = :pending
      end
    rescue ActiveRecord::RecordNotUnique
      # Concurrent job already created this recipient — safe to skip
    end
  end
end
