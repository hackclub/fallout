# == Schema Information
#
# Table name: users
#
#  id           :bigint           not null, primary key
#  avatar       :string           not null
#  display_name :string           not null
#  email        :string           not null
#  is_banned    :boolean          default(FALSE), not null
#  role         :integer          default("user"), not null
#  timezone     :string           not null
#  created_at   :datetime         not null
#  updated_at   :datetime         not null
#  slack_id     :string           not null
#
class User < ApplicationRecord
  enum :role, { user: 0, admin: 1 }

  validates :avatar, :slack_id, :display_name, :timezone, presence: true
  validates :role, presence: true
  validates :is_banned, inclusion: { in: [ true, false ] }

  def self.exchange_slack_token(code, redirect_uri)
    response = Faraday.post("https://slack.com/api/oauth.v2.access",
                            {
                              client_id: ENV.fetch("SLACK_CLIENT_ID", nil),
                              client_secret: ENV.fetch("SLACK_CLIENT_SECRET", nil),
                              redirect_uri: redirect_uri,
                              code: code
                            })

    result = JSON.parse(response.body)

    unless result["ok"]
      Rails.logger.error("Slack OAuth error: #{result['error']}")
      # Honeybadger.notify("Slack OAuth error: #{result['error']}")
      raise StandardError, "Failed to authenticate with Slack: #{result['error']}"
    end

    slack_id = result["authed_user"]["id"]
    user = User.find_by(slack_id: slack_id)
    if user.present?
      Rails.logger.tagged("UserCreation") do
        Rails.logger.info({
          event: "existing_user_found",
          slack_id: slack_id,
          user_id: user.id,
          email: user.email
        }.to_json)
      end

      user.refresh_profile!

      return user
    end

    user = create_from_slack(slack_id)
    user
  end

  def self.create_from_slack(slack_id)
    user_info = fetch_slack_user_info(slack_id)
    if user_info.user.is_bot
      Rails.logger.warn({
        event: "slack_user_is_bot",
        slack_id: slack_id,
        user_info: user_info.to_h
      }.to_json)
      return nil
    end

    email = user_info.user.profile.email
    display_name = user_info.user.profile.display_name.presence || user_info.user.profile.real_name
    timezone = user_info.user.tz
    avatar = user_info.user.profile.image_192 || user_info.user.profile.image_512

    Rails.logger.tagged("UserCreation") do
      Rails.logger.info({
        event: "slack_user_found",
        slack_id: slack_id,
        email: email,
        display_name: display_name,
        timezone: timezone,
        avatar: avatar
      }.to_json)
    end

    if email.blank? || !(email =~ URI::MailTo::EMAIL_REGEXP)
      Rails.logger.warn({
        event: "slack_user_missing_or_invalid_email",
        slack_id: slack_id,
        email: email,
        user_info: user_info.to_h
      }.to_json)
      # Honeybadger.notify("Slack email missing??", context: {
      #   slack_id: slack_id,
      #   email: email,
      #   user_info: user_info.to_h
      # })
      raise StandardError, "Slack ID #{slack_id} has an invalid email: #{email.inspect}"
    end

    User.create!(
      slack_id: slack_id,
      display_name: display_name,
      email: email,
      timezone: timezone,
      avatar: avatar,
      is_banned: false
    )
  end

  def self.fetch_slack_user_info(slack_id)
    client = Slack::Web::Client.new(token: ENV.fetch("SLACK_BOT_TOKEN", nil))

    r = 0
    begin
      client.users_info(user: slack_id)
    rescue Slack::Web::Api::Errors::TooManyRequestsError => e
      if r < 3
        s = e.retry_after
        Rails.logger.warn("Slack API ratelimit, retry in #{s} count#{r + 1}")
        sleep s
        r += 1
        retry
      else
        Rails.logger.error("Slack API ratelimit, max retries on #{slack_id}.")
        Honeybadger.notify("Slack API ratelimit, max retries on #{slack_id}.")
        raise
      end
    end
  end

  def refresh_profile!
    Rails.logger.tagged("ProfileRefresh") do
      Rails.logger.info({
        event: "refreshing_profile_data",
        user_id: id,
        slack_id: slack_id
      }.to_json)
    end

    user_info = User.fetch_slack_user_info(slack_id)

    new_display_name = user_info.user.profile.display_name.presence || user_info.user.profile.real_name
    new_email = user_info.user.profile.email
    new_timezone = user_info.user.tz
    new_avatar = user_info.user.profile.image_original.presence || user_info.user.profile.image_512

    changes = {}
    changes[:display_name] = { from: display_name, to: new_display_name } if display_name != new_display_name
    changes[:email] = { from: email, to: new_email } if email != new_email
    changes[:timezone] = { from: timezone, to: new_timezone } if timezone != new_timezone
    changes[:avatar] = { from: avatar, to: new_avatar } if avatar != new_avatar

    if changes.any?
      Rails.logger.tagged("ProfileRefresh") do
        Rails.logger.info({
          event: "profile_changes_detected",
          user_id: id,
          slack_id: slack_id,
          changes: changes
        }.to_json)
      end

      update!(
        display_name: new_display_name,
        email: new_email,
        timezone: new_timezone,
        avatar: new_avatar
      )

      Rails.logger.tagged("ProfileRefresh") do
        Rails.logger.info({
          event: "profile_refresh_success",
          user_id: id,
          slack_id: slack_id
        }.to_json)
      end
    else
      Rails.logger.tagged("ProfileRefresh") do
        Rails.logger.debug({
          event: "profile_refresh_no_change",
          user_id: id,
          slack_id: slack_id
        }.to_json)
      end
    end
  rescue StandardError => e
    Rails.logger.tagged("ProfileRefresh") do
      Rails.logger.error({
        event: "profile_refresh_failed",
        user_id: id,
        slack_id: slack_id,
        error: e.message
      }.to_json)
    end

    # Honeybadger.notify(e, context: { user_id: id, slack_id: slack_id })
  end
end
