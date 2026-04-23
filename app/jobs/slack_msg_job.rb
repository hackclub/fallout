# Sends a Slack message to any conversation (user DM or channel).
# Slack's chat_postMessage treats user IDs and channel IDs identically.
class SlackMsgJob < ApplicationJob
  queue_as :default
  limits_concurrency to: 1, key: "slack_api" # Slack rate limit is ~1 msg/sec per workspace

  retry_on Slack::Web::Api::Errors::TooManyRequestsError, wait: :polynomially_longer, attempts: 5
  retry_on Slack::Web::Api::Errors::TimeoutError, wait: :polynomially_longer, attempts: 3 # Transient upstream timeout — retry with backoff

  def perform(slack_id, message)
    client = Slack::Web::Client.new(token: ENV.fetch("SLACK_BOT_TOKEN", nil))

    client.chat_postMessage(
      channel: slack_id,
      text: message
    )

    sleep 1.1 # Stay under Slack's ~1 msg/sec workspace rate limit
  rescue StandardError => e
    Rails.logger.tagged("SlackMsgJob") do
      Rails.logger.error({ event: "slack_msg_failed", slack_id: slack_id, error: e.message }.to_json)
    end
    raise e
  end
end
