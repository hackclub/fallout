# POSTs a soup campaign button click to the button's webhook URL. Body matches anscg/rsvp-helper's
# webhook buttons so the same receivers (e.g. Fallen's /api/slack/join) work. Not retried: webhooks
# like signups may not be idempotent. Returns true on a 2xx.
module SoupCampaignButtonWebhook
  module_function

  def deliver(campaign, index, slack_id)
    button = campaign.buttons[index]
    body = {
      type: "button_click",
      user_id: slack_id,
      campaign_id: campaign.id,
      button_label: button["label"],
      value: button["value"],
      clicked_at: Time.current.iso8601(3)
    }.compact.to_json

    response = Faraday.new(request: { timeout: 8, open_timeout: 4 }).post(button["webhook_url"], body) do |req| # Redirects are not followed
      req.headers["Content-Type"] = "application/json"
      secret = ENV["SOUP_WEBHOOK_SIGNING_SECRET"]
      req.headers["X-Fallout-Signature"] = "sha256=#{OpenSSL::HMAC.hexdigest('SHA256', secret, body)}" if secret.present?
    end
    log_failure(campaign, index, "HTTP #{response.status}") unless response.success?
    response.success?
  rescue Faraday::Error => e
    log_failure(campaign, index, e.message)
    false
  end

  def log_failure(campaign, index, error)
    Rails.logger.tagged("SoupCampaignButtonWebhook") do
      Rails.logger.error({ event: "webhook_failed", campaign_id: campaign.id, button_index: index, error: }.to_json)
    end
  end
end
