desc "Backfill streak days for journal entries affected by the Date.current timezone bug"
task backfill_streak_days: :environment do
  cutoff = 15.hours.ago
  fixed = 0
  skipped = 0

  # Find all verified users who created journal entries in the affected window
  user_ids = JournalEntry.kept
    .where("created_at >= ?", cutoff)
    .joins(:user)
    .where(users: { type: nil }) # Full users only (not TrialUser)
    .distinct
    .pluck(:user_id)

  puts "Found #{user_ids.size} users with journal entries in the last 15 hours."

  User.where(id: user_ids).find_each do |user|
    tz = ActiveSupport::TimeZone[user.timezone] || ActiveSupport::TimeZone["UTC"]

    # Get all journal entry dates in the user's local timezone within the window
    dates = JournalEntry.kept
      .where(user: user)
      .where("created_at >= ?", cutoff)
      .pluck(:created_at)
      .map { |t| t.in_time_zone(tz).to_date }
      .uniq

    dates.each do |date|
      streak_day = StreakDay.find_by(user: user, date: date)
      next if streak_day&.status_active?

      seconds = StreakService.daily_seconds_logged(user, date)
      next unless seconds >= StreakService::STREAK_THRESHOLD_SECONDS

      if streak_day
        streak_day.update!(status: :active)
      else
        StreakDay.create!(user: user, date: date, status: :active)
      end

      user.streak_events.find_or_create_by!(
        event_type: "day_completed",
        metadata: { date: date.iso8601 }
      )

      fixed += 1
      puts "  Fixed: #{user.display_name} — #{date}"
    end
  rescue StandardError => e
    skipped += 1
    puts "  Error for user #{user.id}: #{e.message}"
  end

  puts "Done. Fixed #{fixed} streak days, skipped #{skipped} errors."
end
