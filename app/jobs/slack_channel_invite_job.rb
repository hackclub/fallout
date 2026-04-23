# Invites a user to one or more Slack channels.
# Accepts a single channel ID string or an array of channel IDs.
class SlackChannelInviteJob < ApplicationJob
  queue_as :default

  def perform(slack_id, channel_ids)
    channel_ids = Array(channel_ids)

    channel_ids.each do |channel_id|
      invite_to_channel(channel_id, slack_id)
    end
  end

  private

  def invite_to_channel(channel_id, slack_id)
    slack_client.conversations_invite(channel: channel_id, users: slack_id)
  rescue Slack::Web::Api::Errors::AlreadyInChannel
    # no-op
  rescue Slack::Web::Api::Errors::UserIsRestricted
    Rails.logger.tagged("SlackChannelInviteJob") do
      Rails.logger.warn({ event: "user_restricted", slack_id: slack_id, channel_id: channel_id }.to_json)
    end
  rescue Slack::Web::Api::Errors::CantInvite
    # User cannot be invited (already a member in a different form, account deactivated, etc.) — log and move on
    Rails.logger.tagged("SlackChannelInviteJob") do
      Rails.logger.warn({ event: "cant_invite", slack_id: slack_id, channel_id: channel_id }.to_json)
    end
  rescue StandardError => e
    Rails.logger.tagged("SlackChannelInviteJob") do
      Rails.logger.error({ event: "invite_failed", slack_id: slack_id, channel_id: channel_id, error: e.message }.to_json)
    end
    raise e
  end

  def slack_client
    @slack_client ||= Slack::Web::Client.new(token: ENV.fetch("SLACK_BOT_TOKEN", nil))
  end
end
