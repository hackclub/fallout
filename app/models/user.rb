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
#  slack_id     :string
#  hca_id       :string
#
class User < ApplicationRecord
  enum :role, { user: 0, admin: 1 }

  validates :avatar, :display_name, :timezone, presence: true
  validates :hca_id, presence: true, uniqueness: true
  validates :role, presence: true
  validates :is_banned, inclusion: { in: [ true, false ] }

  def self.exchange_hca_token(code, redirect_uri)
    response = Faraday.post("#{HCAService.host}/oauth/token",
                            {
                              client_id: ENV.fetch("HCA_CLIENT_ID"),
                              client_secret: ENV.fetch("HCA_CLIENT_SECRET"),
                              redirect_uri: redirect_uri,
                              code: code,
                              grant_type: "authorization_code"
                            })

    result = JSON.parse(response.body)

    unless response.success?
      Rails.logger.error("HCA OAuth error: #{result['error'] || result}")
      raise StandardError, "Failed to authenticate with HCA: #{result['error_description'] || result['error']}"
    end

    access_token = result["access_token"]
    user_info = HCAService.me(access_token)

    unless user_info
      raise StandardError, "Failed to fetch user info from HCA"
    end

    hca_id = user_info["id"]
    user = User.find_by(hca_id: hca_id)

    if user.present?
      Rails.logger.tagged("UserCreation") do
        Rails.logger.info({
          event: "existing_user_found",
          hca_id: hca_id,
          user_id: user.id,
          email: user.email
        }.to_json)
      end

      user.refresh_profile!(user_info)
      return user
    end

    create_from_hca(user_info)
  end

  def self.create_from_hca(user_info)
    hca_id = user_info["id"]
    identity = user_info["identity"] || {}
    email = user_info["email"]
    display_name = identity["full_name"].presence || email&.split("@")&.first || "User"
    timezone = identity["timezone"].presence || "America/New_York"
    avatar = identity["avatar_url"].presence || "https://auth.hackclub.com/avatars/default.png"

    Rails.logger.tagged("UserCreation") do
      Rails.logger.info({
        event: "hca_user_found",
        hca_id: hca_id,
        email: email,
        display_name: display_name,
        timezone: timezone,
        avatar: avatar
      }.to_json)
    end

    if email.blank? || !(email =~ URI::MailTo::EMAIL_REGEXP)
      Rails.logger.warn({
        event: "hca_user_missing_or_invalid_email",
        hca_id: hca_id,
        email: email,
        user_info: user_info
      }.to_json)
      raise StandardError, "HCA ID #{hca_id} has an invalid email: #{email.inspect}"
    end

    User.create!(
      hca_id: hca_id,
      display_name: display_name,
      email: email,
      timezone: timezone,
      avatar: avatar,
      is_banned: false
    )
  end

  def refresh_profile!(user_info = nil)
    Rails.logger.tagged("ProfileRefresh") do
      Rails.logger.info({
        event: "refreshing_profile_data",
        user_id: id,
        hca_id: hca_id
      }.to_json)
    end

    return unless user_info

    identity = user_info["identity"] || {}
    new_display_name = identity["full_name"].presence || email&.split("@")&.first || display_name
    new_email = user_info["email"] || email
    new_timezone = identity["timezone"].presence || timezone
    new_avatar = identity["avatar_url"].presence || avatar

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
          hca_id: hca_id,
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
          hca_id: hca_id
        }.to_json)
      end
    else
      Rails.logger.tagged("ProfileRefresh") do
        Rails.logger.debug({
          event: "profile_refresh_no_change",
          user_id: id,
          hca_id: hca_id
        }.to_json)
      end
    end
  rescue StandardError => e
    Rails.logger.tagged("ProfileRefresh") do
      Rails.logger.error({
        event: "profile_refresh_failed",
        user_id: id,
        hca_id: hca_id,
        error: e.message
      }.to_json)
    end
  end
end
