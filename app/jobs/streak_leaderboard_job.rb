# Posts a daily streak leaderboard to the public Fallout Slack channel at noon ET.
class StreakLeaderboardJob < ApplicationJob
  queue_as :background

  def perform
    user_ids = User.verified.kept.joins(:streak_days).distinct.pluck(:id)
    return if user_ids.empty?

    users_by_id = User.where(id: user_ids).index_by(&:id)

    # One query for every streak-counting day across all candidate users, instead
    # of two per-user round trips (StreakDay.current_streak + frozen_count) — for
    # ~hundreds of users this collapses N×2 queries down to 1.
    days_by_user = StreakDay
      .where(user_id: user_ids, status: [ :active, :frozen ])
      .order(date: :desc)
      .pluck(:user_id, :date, :status)
      .group_by(&:first)

    top = users_by_id.map do |uid, user|
      day_pairs = (days_by_user[uid] || []).map { |_, date, status| [ date, status ] }
      streak, frozen = compute_streak_and_frozen(user, day_pairs)
      [ user, streak, frozen ]
    end
    top = top.select { |_, streak, _| streak > 0 }
             .sort_by { |_, streak, frozen| [ -streak, frozen ] }
             .first(15)

    return if top.empty?

    rows = top.each_with_index.map do |(user, streak, frozen), i|
      medal = [ ":first_place_medal:", ":second_place_medal:", ":third_place_medal:" ][i]
      prefix = medal || "#{i + 1}."
      freeze_tag = frozen > 0 ? " :fallout-frozenfire: #{frozen}" : ""
      "#{prefix} #{user.display_name} — #{streak} days#{freeze_tag}"
    end

    message = ":oi: *Daily Streak Leaderboard*!!\nThanks for feeding me!\n\n#{rows.join("\n")}"

    client = Slack::Web::Client.new(token: ENV.fetch("SLACK_BOT_TOKEN", nil))
    client.chat_postMessage(channel: StreakService::STREAK_ANNOUNCEMENT_CHANNEL, text: message)
  rescue StandardError => e
    ErrorReporter.capture_exception(e, contexts: { streak_leaderboard: { action: "post" } })
  end

  private

  # Returns [streak_length, frozen_count_within_streak] from a date-desc list of
  # [date, status] pairs (only active/frozen statuses included). Mirrors the
  # logic in StreakDay.current_streak and the prior current_streak_frozen_count,
  # but operates on preloaded data so it doesn't re-query per user.
  def compute_streak_and_frozen(user, day_pairs)
    return [ 0, 0 ] if day_pairs.empty?

    today = Time.current.in_time_zone(user.timezone).to_date
    yesterday = today - 1.day
    pairs = day_pairs.select { |date, _| date <= today }
    return [ 0, 0 ] if pairs.empty?

    most_recent_date = pairs.first.first
    expected = if most_recent_date == today
      today
    elsif most_recent_date == yesterday
      yesterday
    else
      return [ 0, 0 ]
    end

    streak = 0
    frozen = 0
    pairs.each do |date, status|
      break unless date == expected
      streak += 1
      frozen += 1 if status == "frozen"
      expected -= 1.day
    end

    [ streak, frozen ]
  end
end
