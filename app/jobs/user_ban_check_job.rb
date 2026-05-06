class UserBanCheckJob < ApplicationJob
  queue_as :background

  def perform
    Rails.logger.info "UserBanCheckJob started at #{Time.current}"

    counters = { checked: 0, banned: 0, unbanned: 0 }

    User.verified.where.not(slack_id: [ nil, "" ]).find_each do |user|
      check_user_bans(user, counters)
    rescue => e
      Rails.logger.error("UserBanCheckJob error for user #{user.id}: #{e.message}")
      ErrorReporter.capture_exception(e, contexts: { ban_check: { user_id: user.id } })
    end

    Rails.logger.info "UserBanCheckJob completed: checked #{counters[:checked]}, banned #{counters[:banned]}, unbanned #{counters[:unbanned]}"
  end

  private

  def check_user_bans(user, counters)
    counters[:checked] += 1

    # Preserve manually-set bans: job should not override or clear them
    return if user.is_banned && user.ban_type.in?(User::MANUAL_BAN_TYPES)

    # Check automated bans (only hackatime for now)
    case hackatime_ban_status(user.slack_id)
    when :banned
      unless user.is_banned && user.ban_type == "hackatime"
        user.update!(is_banned: true, ban_type: "hackatime")
        counters[:banned] += 1
        Rails.logger.info "User #{user.id} (#{user.slack_id}) banned for hackatime"
      end
    when :not_banned
      # No automated bans apply — unban if currently auto-banned
      if user.is_banned && !user.ban_type.in?(User::MANUAL_BAN_TYPES)
        user.update!(is_banned: false, ban_type: nil)
        counters[:unbanned] += 1
        Rails.logger.info "User #{user.id} (#{user.slack_id}) unbanned"
      end
    when :unknown
      # Transient API failure — leave ban state untouched to avoid mass unbans during outages
    end
  end

  def hackatime_ban_status(slack_id)
    return :not_banned if slack_id.blank?

    response = Faraday.get("https://hackatime.hackclub.com/api/v1/users/#{slack_id}/trust_factor")

    unless response.success?
      return :not_banned if response.status == 404 # user unknown to Hackatime = not banned

      Rails.logger.warn("Hackatime API returned #{response.status} for #{slack_id}")
      # Transient upstream failure (e.g. 504 gateway timeout) — capture at warning so it doesn't alert as an unhandled error
      ErrorReporter.capture_message("Hackatime API failed for #{slack_id}: #{response.status}", level: :warning)
      return :unknown
    end

    data = JSON.parse(response.body)
    data["trust_level"] == "red" ? :banned : :not_banned
  rescue Faraday::TimeoutError, Faraday::ConnectionFailed => e
    # Transient network errors to upstream Hackatime — warning level, leave ban state untouched
    Rails.logger.warn("Hackatime ban check network error for #{slack_id}: #{e.message}")
    ErrorReporter.capture_exception(e, level: :warning, contexts: { ban_check: { slack_id: slack_id } })
    :unknown
  rescue => e
    Rails.logger.error("Hackatime ban check failed for #{slack_id}: #{e.message}")
    ErrorReporter.capture_exception(e, contexts: { ban_check: { slack_id: slack_id } })
    :unknown
  end
end
