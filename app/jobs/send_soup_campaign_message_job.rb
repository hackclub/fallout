# Sends a single Soup campaign message to one recipient.
# Safe to retry — checks status before sending to avoid duplicates.
class SendSoupCampaignMessageJob < ApplicationJob
  queue_as :default
  limits_concurrency to: 1, key: "slack_api" # Share rate-limit key with SlackMsgJob

  retry_on Slack::Web::Api::Errors::TooManyRequestsError, wait: :polynomially_longer, attempts: 5

  def perform(recipient_id)
    recipient = SoupCampaignRecipient.find_by(id: recipient_id)
    return unless recipient
    return unless recipient.pending? # Idempotency guard

    campaign = recipient.soup_campaign
    return if campaign.cancelled?

    # Respect per-recipient unsubscribe
    if recipient.unsubscribed?
      recipient.update!(status: :skipped)
      return
    end

    unsubscribe_url = Rails.application.routes.url_helpers.soup_campaign_unsubscribe_url(
      token: recipient.unsubscribe_token,
      host: ENV.fetch("APP_HOST", "fallout.hackclub.com")
    )

    client = Slack::Web::Client.new(token: ENV.fetch("SLACK_BOT_TOKEN", nil))
    client.chat_postMessage(
      channel: recipient.slack_id,
      text: interpolate(campaign.body, recipient), # Fallback text for notifications
      username: "Soup",
      icon_url: "https://avatars.slack-edge.com/2026-03-03/10620134255189_994e10cd91f0fc88ad9c_512.jpg",
      blocks: build_blocks(campaign, unsubscribe_url, recipient).to_json
    )

    recipient.update!(status: :sent, sent_at: Time.current)
    sleep 1.1 # Stay under Slack's ~1 msg/sec workspace rate limit
  rescue Slack::Web::Api::Errors::SlackError => e
    recipient.update!(status: :failed, error_message: e.message)
    Rails.logger.tagged("SendSoupCampaignMessageJob") do
      Rails.logger.error({ event: "send_failed", recipient_id: recipient_id, error: e.message }.to_json)
    end
  rescue StandardError => e
    recipient.update!(status: :failed, error_message: e.message)
    raise e
  end

  private

  def build_blocks(campaign, unsubscribe_url, recipient)
    blocks = []

    # Body — interpolate {name} with recipient's display name
    blocks << { type: "section", text: { type: "mrkdwn", text: interpolate(campaign.body, recipient) } }

    # Footer (optional)
    if campaign.footer.present?
      blocks << { type: "section", text: { type: "mrkdwn", text: interpolate(campaign.footer, recipient) } }
    end

    # Image (optional)
    if campaign.image_url.present?
      blocks << { type: "image", image_url: campaign.image_url, alt_text: campaign.name }
    end

    # Divider before context footer
    blocks << { type: "divider" }

    # Context block — renders as small gray text, Slack-native footer pattern
    blocks << {
      type: "context",
      elements: [
        { type: "mrkdwn", text: "#{campaign.unsubscribe_label} · <#{unsubscribe_url}|Unsubscribe>" }
      ]
    }

    blocks
  end

  # Replaces {name} with the recipient's display name (falls back to "there" if unknown)
  def interpolate(text, recipient)
    first_name = recipient.display_name&.split&.first || "there"
    text.gsub("{name}", first_name)
  end
end
