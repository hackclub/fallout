# Posts a daily streak leaderboard to the public Fallout Slack channel at noon ET.
class StreakLeaderboardJob < ApplicationJob
  queue_as :background

  def perform
    top = User.verified.kept
               .joins(:streak_days)
               .distinct
               .select("users.*")
               .map { |u| [ u, StreakDay.current_streak(u), current_streak_frozen_count(u) ] }
               .select { |_, streak, _| streak > 0 }
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

  def current_streak_frozen_count(user)
    today = Time.current.in_time_zone(user.timezone).to_date
    yesterday = today - 1.day

    days = StreakDay.where(user: user).streak_counting.where("date <= ?", today).reverse_chronological.pluck(:date, :status)
    return 0 if days.empty?

    most_recent_date = days.first.first
    start_from = if most_recent_date == today
      today
    elsif most_recent_date == yesterday
      yesterday
    else
      return 0
    end

    frozen_count = 0
    expected = start_from

    days.each do |date, status|
      break unless date == expected

      frozen_count += 1 if status == "frozen"
      expected -= 1.day
    end

    frozen_count
  end
end
