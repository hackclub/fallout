# Sends a Slack message to any conversation (user DM or channel).
# Slack's chat_postMessage treats user IDs and channel IDs identically.
class SlackMsgJob < ApplicationJob
  queue_as :default

  def perform(slack_id, message)
    client = Slack::Web::Client.new(token: ENV.fetch("SLACK_BOT_TOKEN", nil))

    client.chat_postMessage(
      channel: slack_id,
      text: message
    )
  rescue StandardError => e
    Rails.logger.tagged("SlackMsgJob") do
      Rails.logger.error({ event: "slack_msg_failed", slack_id: slack_id, error: e.message }.to_json)
    end
    raise e
  end
end
