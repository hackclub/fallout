# Orchestrates sending a Soup campaign. Safe to re-enqueue on server restart —
# it skips recipients that are already sent/failed/skipped and only enqueues
# pending ones. This makes the whole send durable across restarts.
class SendSoupCampaignJob < ApplicationJob
  queue_as :default

  FALLOUT_CHANNEL_ID = "C037157AL30"

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
    slack_ids = collect_slack_ids(campaign)

    slack_ids.each do |slack_id, display_name|
      campaign.soup_campaign_recipients.find_or_create_by!(slack_id: slack_id) do |r|
        r.display_name = display_name
        r.status = :pending
      end
    rescue ActiveRecord::RecordNotUnique
      # Concurrent job already created this recipient — safe to skip
    end
  end

  def collect_slack_ids(campaign)
    results = {}

    # Fallout users with a slack_id
    User.verified.kept.where.not(slack_id: nil).find_each do |user|
      results[user.normalized_slack_id] ||= user.display_name
    end

    # Members of #fallout channel who may not be registered Fallout users
    channel_members = fetch_channel_members
    channel_members.each do |slack_id|
      results[slack_id] ||= nil
    end

    results
  end

  def fetch_channel_members
    client = Slack::Web::Client.new(token: ENV.fetch("SLACK_BOT_TOKEN", nil))
    members = []
    cursor = nil

    loop do
      response = client.conversations_members(channel: FALLOUT_CHANNEL_ID, limit: 200, cursor: cursor)
      members.concat(response.members)
      cursor = response.response_metadata&.next_cursor
      break if cursor.blank?
    end

    members
  rescue Slack::Web::Api::Errors::SlackError => e
    Rails.logger.tagged("SendSoupCampaignJob") do
      Rails.logger.error({ event: "channel_members_fetch_failed", error: e.message }.to_json)
    end
    []
  end
end
