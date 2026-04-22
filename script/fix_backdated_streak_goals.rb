# frozen_string_literal: true

# Find all active StreakGoal records where the started_on date is backdated 
# (before the created_at date of the goal itself, taking timezone into account).
#
# Corrects them based on the new logic: capping the backdate to target_days - 1 
# days so the goal is never immediately satisfiable on creation.

kept_goals = StreakGoal.kept.includes(:user)

backdated_goals = kept_goals.select do |goal|
  user_tz = goal.user.timezone.presence || "UTC"
  created_date = goal.created_at.in_time_zone(user_tz).to_date
  goal.started_on < created_date
end

puts "Found #{backdated_goals.count} active backdated StreakGoal records."

backdated_goals.each do |goal|
  user = goal.user
  target_days = goal.target_days
  user_tz = user.timezone.presence || "UTC"
  created_date = goal.created_at.in_time_zone(user_tz).to_date
  
  # Calculate what the start date should have been on created_date based on new logic
  days = StreakDay.where(user: user)
                  .streak_counting
                  .where("date <= ?", created_date)
                  .order(date: :desc)
                  .pluck(:date)
  
  correct_started_on = created_date
  unless days.empty?
    most_recent = days.first
    if most_recent == created_date || most_recent == created_date - 1.day
      expected = most_recent
      start = most_recent
      count = 0
      days.each do |date|
        break unless date == expected
        break if count >= target_days - 1 # Cap to target_days - 1 days
        start = date
        expected -= 1.day
        count += 1
      end
      correct_started_on = start
    end
  end

  if goal.started_on != correct_started_on
    puts "Fixing StreakGoal ##{goal.id} (User ##{user.id}):"
    puts "  Created date (in #{user_tz}): #{created_date}"
    puts "  Target days: #{target_days}"
    puts "  Old started_on: #{goal.started_on}"
    puts "  New started_on: #{correct_started_on}"
    
    goal.update!(started_on: correct_started_on)
  else
    puts "StreakGoal ##{goal.id} is backdated but correct according to the cap (started_on: #{goal.started_on})."
  end
end

puts "Done."
