# Replaces Slack permalink URLs in a body of text with a formatted block
# fetched from the Slack API. The URL itself is preserved only inside the
# "[link](URL)" anchor in the substituted output.
class SlackMessageFetcher
  URL_REGEX = %r{https://[\w.-]+\.slack\.com/archives/(?<channel>[A-Z0-9]+)/p(?<ts10>\d{10})(?<ts6>\d{6})(?:\?[^\s]*thread_ts=(?<thread_ts>[\d.]+))?[^\s]*}

  # Returns the text with any resolvable Slack permalink replaced by:
  #   @username said in #channel-name (https://...):
  #   <message contents>
  # Unresolvable URLs are left untouched.
  def self.expand_urls(text)
    return text if text.blank?

    text.gsub(URL_REGEX) do |url|
      preview = fetch(url)
      preview ? format_preview(preview) : url
    end
  end

  def self.format_preview(preview)
    channel = preview[:channel_name] ? "#" + preview[:channel_name] : "#channel"
    "@#{preview[:user_name]} said in #{channel} (#{preview[:url]}):\n#{preview[:text]}"
  end
  private_class_method :format_preview

  def self.fetch(url)
    match = URL_REGEX.match(url.to_s)
    return nil unless match

    channel_id = match[:channel]
    ts = "#{match[:ts10]}.#{match[:ts6]}"
    thread_ts = match[:thread_ts]

    client = Slack::Web::Client.new(token: ENV.fetch("SLACK_BOT_TOKEN", nil))
    message = fetch_message(client, channel_id, ts, thread_ts)
    return nil unless message

    user_info = message[:user] ? safe_users_info(client, message[:user]) : nil
    channel_info = safe_channel_info(client, channel_id)

    {
      url: url,
      text: message[:text].to_s,
      user_name: user_info&.dig(:profile, :display_name).presence ||
                 user_info&.dig(:profile, :real_name).presence ||
                 user_info&.dig(:real_name).presence ||
                 message[:username].presence || "unknown",
      channel_name: channel_info&.dig(:name)
    }
  rescue Slack::Web::Api::Errors::SlackError, Faraday::Error => e
    Rails.logger.warn("SlackMessageFetcher.fetch failed for #{url}: #{e.class}: #{e.message}")
    nil
  end

  def self.fetch_message(client, channel_id, ts, thread_ts)
    if thread_ts.present?
      reply = client.conversations_replies(channel: channel_id, ts: thread_ts, latest: ts, oldest: ts, inclusive: true, limit: 1)
      reply.messages.find { |m| m.ts == ts } || reply.messages.first
    else
      history = client.conversations_history(channel: channel_id, latest: ts, oldest: (ts.to_f - 1).to_s, inclusive: true, limit: 1)
      history.messages.first
    end
  end
  private_class_method :fetch_message

  def self.safe_users_info(client, user_id)
    client.users_info(user: user_id).user
  rescue Slack::Web::Api::Errors::SlackError, Faraday::Error
    nil
  end
  private_class_method :safe_users_info

  def self.safe_channel_info(client, channel_id)
    client.conversations_info(channel: channel_id).channel
  rescue Slack::Web::Api::Errors::SlackError, Faraday::Error
    nil
  end
  private_class_method :safe_channel_info
end
