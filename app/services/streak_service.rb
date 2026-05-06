class StreakService
  MAX_FREEZES = 5
  MILESTONES = [ 7, 14, 30, 60, 100 ].freeze
  STREAK_THRESHOLD_SECONDS = 1.hour.to_i # Minimum daily recording time to count toward a streak
  GOAL_KOI_REWARDS = { 3 => 1, 5 => 2, 7 => 5, 14 => 12 }.freeze
  STREAK_ANNOUNCEMENT_CHANNEL = "C037157AL30" # Public channel for streak goal announcements

  def self.record_activity(user, date: nil)
    return if user.trial?

    reconcile_missed_days(user)

    date ||= Time.current.in_time_zone(user.timezone).to_date
    streak_day = StreakDay.find_or_initialize_by(user: user, date: date)
    return if streak_day.status_active?
    return if streak_day.status_frozen? || streak_day.status_missed?
    return unless daily_seconds_logged(user, date) >= STREAK_THRESHOLD_SECONDS - 8.minutes.to_i

    streak_day.status = :active
    streak_day.save!

    user.streak_events.create!(event_type: "day_completed", metadata: { date: date.iso8601 })
    check_milestones(user)
    check_goal_completion(user)
  end

  def self.daily_seconds_logged(user, date)
    tz = ActiveSupport::TimeZone[user.timezone] || ActiveSupport::TimeZone["UTC"]
    day_start = tz.parse(date.to_s).beginning_of_day
    day_end = day_start.end_of_day

    journal_ids = JournalEntry.kept.where(user: user, created_at: day_start..day_end).select(:id)

    lapse = LapseTimelapse.joins(:recording).where(recordings: { journal_entry_id: journal_ids }).sum(:duration).to_i
    youtube = YouTubeVideo.joins(:recording).where(recordings: { journal_entry_id: journal_ids }).sum(Arel.sql("duration_seconds * stretch_multiplier")).to_i
    lookout = LookoutTimelapse.joins(:recording).where(recordings: { journal_entry_id: journal_ids }).sum(:duration).to_i

    lapse + youtube + lookout
  end

  def self.reconcile_missed_days(user)
    user.with_lock do
      today = Time.current.in_time_zone(user.timezone).to_date
      last_entry = StreakDay.where(user: user).streak_counting.where("date < ?", today).reverse_chronological.first
      next unless last_entry

      # Count streak length ending at last_entry — can't use current_streak here because it
      # requires continuity to today/yesterday, which doesn't hold when reconciling a gap.
      # If a streak_broken event already exists after the last active day, the notification
      # was already sent — don't re-notify on subsequent missed days.
      already_broken = user.streak_events.where(event_type: "streak_broken")
                           .where("metadata->>'date' > ?", last_entry.date.iso8601)
                           .exists?
      streak_before_reconciliation = already_broken ? 0 : streak_length_ending_at(user, last_entry.date)

      ((last_entry.date + 1.day)...(today)).each do |date|
        streak_day = StreakDay.find_by(user: user, date: date)
        next unless streak_day.nil? || streak_day.status_pending?

        user.reload # Freeze count may have changed from previous iteration
        if user.streak_freezes > 0
          use_freeze(user, date, streak_day)
          check_goal_completion(user) # Frozen days count toward goal progress
        else
          mark_missed(user, date, streak_day, streak_before_reconciliation)
          streak_before_reconciliation = 0
        end
      end
    end
  end

  def self.check_milestones(user)
    current = StreakDay.current_streak(user)
    return unless current.in?(MILESTONES)

    already_earned = user.streak_events.where(event_type: "streak_milestone")
                         .where("metadata->>'streak_length' = ?", current.to_s)
                         .exists?
    return if already_earned

    user.streak_events.create!(event_type: "streak_milestone", metadata: { streak_length: current })

    if user.streak_freezes < MAX_FREEZES
      user.increment!(:streak_freezes)
      user.streak_events.create!(event_type: "freeze_earned", metadata: { streak_length: current, new_total: user.streak_freezes })
    end

    notify_milestone(user, current)
  end

  def self.send_reminder(user)
    today = Time.current.in_time_zone(user.timezone).to_date
    streak_day = StreakDay.find_by(user: user, date: today)

    return if streak_day&.status_active?

    current_streak = StreakDay.current_streak(user)
    return if current_streak.zero?

    if user.streak_slack_notifications && user.slack_id.present?
      SlackMsgJob.perform_later(user.slack_id, reminder_message(user.display_name, current_streak))
    end

    if user.streak_in_app_notifications
      MailDeliveryService.streak_reminder(user, current_streak)
    end
  end

  def self.repair_frozen_day(user, journal_entry)
    return unless journal_entry

    tz = ActiveSupport::TimeZone[user.timezone] || ActiveSupport::TimeZone["UTC"]
    date = journal_entry.created_at.in_time_zone(tz).to_date

    user.with_lock do
      streak_day = StreakDay.find_by(user: user, date: date)
      next unless streak_day&.status_frozen?
      next unless daily_seconds_logged(user, date) >= STREAK_THRESHOLD_SECONDS

      streak_day.update!(status: :active)
      User.where(id: user.id).update_all("streak_freezes = LEAST(streak_freezes + 1, #{MAX_FREEZES})")
      user.reload
      user.streak_events.create!(event_type: "freeze_restored", metadata: { date: date.iso8601, reason: "youtube_duration_late" })
      check_milestones(user)
      check_goal_completion(user)
    end
  end

  private_class_method def self.notify_milestone(user, streak_length)
    if user.streak_slack_notifications && user.slack_id.present?
      SlackMsgJob.perform_later(user.slack_id, ":yay: #{streak_length}-day streak! You're on fire! Keep it up!")
    end

    if user.streak_in_app_notifications
      MailDeliveryService.streak_milestone(user, streak_length)
    end
  end

  private_class_method def self.use_freeze(user, date, streak_day)
    if streak_day
      streak_day.update!(status: :frozen)
    else
      StreakDay.create!(user: user, date: date, status: :frozen)
    end

    # Atomic decrement that refuses to go negative — returns 0 rows updated if streak_freezes is already 0
    rows = User.where(id: user.id).where("streak_freezes > 0").update_all("streak_freezes = streak_freezes - 1")
    raise ActiveRecord::RecordInvalid, "No freezes available to decrement" if rows.zero?

    user.reload
    user.streak_events.create!(event_type: "freeze_used", metadata: { date: date.iso8601, remaining: user.streak_freezes })

    goal = user.streak_goal
    return if goal && !goal.notify_streak_events

    if user.streak_slack_notifications && user.slack_id.present?
      SlackMsgJob.perform_later(user.slack_id, ":ice_cube: I used a streak freeze for you yesterday! You have #{user.streak_freezes} left.")
    end

    if user.streak_in_app_notifications
      MailDeliveryService.streak_freeze_used(user, user.streak_freezes)
    end
  end

  private_class_method def self.check_goal_completion(user)
    goal = user.streak_goal
    return unless goal&.completed?

    already_rewarded = user.streak_events
                           .where(event_type: "goal_completed")
                           .where("metadata->>'target_days' = ?", goal.target_days.to_s)
                           .where("metadata->>'started_on' = ?", goal.started_on.iso8601)
                           .exists?
    return if already_rewarded

    user.streak_events.create!(
      event_type: "goal_completed",
      metadata: { target_days: goal.target_days, started_on: goal.started_on.iso8601 }
    )

    koi_amount = GOAL_KOI_REWARDS[goal.target_days]
    if koi_amount
      KoiTransaction.create!(
        user: user,
        actor: nil, # System-generated reward
        amount: koi_amount,
        reason: "streak_goal",
        description: "Completed #{goal.target_days}-day streak goal"
      )
    end

    campaign = user.dialog_campaigns.find_or_initialize_by(key: "streak_goal_completed")
    campaign.update!(seen_at: nil)

    nudge = user.dialog_campaigns.find_by(key: "streak_goal_nudge")
    nudge&.mark_seen!

    if user.streak_freezes < MAX_FREEZES
      user.increment!(:streak_freezes)
      user.streak_events.create!(
        event_type: "freeze_earned",
        metadata: { reason: "goal_completed", target_days: goal.target_days, new_total: user.streak_freezes }
      )
    end

    unless goal.notify_streak_events == false
      if user.streak_slack_notifications && user.slack_id.present?
        SlackMsgJob.perform_later(user.slack_id, ":tada: You completed your #{goal.target_days}-day streak goal!")
      end

      if user.streak_in_app_notifications
        MailDeliveryService.streak_goal_completed(user, goal.target_days)
      end
    end

    announce_goal_completed(user, goal.target_days) if user.slack_id.present? && goal.notify_streak_events != false
  end

  private_class_method def self.mark_missed(user, date, streak_day, broken_streak)
    if streak_day
      streak_day.update!(status: :missed)
    else
      StreakDay.create!(user: user, date: date, status: :missed)
    end

    user.streak_events.create!(event_type: "streak_broken", metadata: { date: date.iso8601, streak_length: broken_streak })

    goal = user.streak_goal
    if goal
      goal_notify = goal.notify_streak_events
      user.streak_events.create!(event_type: "goal_broken", metadata: { target_days: goal.target_days, started_on: goal.started_on.iso8601 })
      broken_target = goal.target_days
      goal.discard
      if goal_notify && broken_target > 3
        MailDeliveryService.streak_goal_broken(user, broken_target)
      end
      # Only announce publicly if it's not a 3-day goal
      announce_goal_broken(user, broken_target) if user.slack_id.present? && goal_notify && broken_target > 3
    end

    if broken_streak > 0
      goal_notify = goal_notify.nil? ? true : goal_notify
      if goal_notify
        if user.streak_slack_notifications && user.slack_id.present?
          SlackMsgJob.perform_later(user.slack_id, ":broken_heart: Your #{broken_streak}-day streak ended. Start a new one today!")
        end

        if user.streak_in_app_notifications
          MailDeliveryService.streak_broken(user, broken_streak)
        end
      end
    end
  end

  private_class_method def self.reminder_message(name, streak)
    variants = [
      ":oi: Yo #{name}! Ya haven't posted a journal entry today! I'm so hungry!! Your #{streak}-day streak is on the line :<",
      ":oi: #{name}!! no journal = no koi = one very sad soup :< your #{streak}-day streak is slipping away!!",
      ":oi: HELLO?? #{name}?? i haven't eaten all day and it's YOUR fault. post a journal entry before your #{streak}-day streak disappears!!",
      ":oi: yo #{name} i'm literally starving out here. your #{streak}-day streak won't save itself. journal. NOW. (please.)",
      ":oi: #{name} i swear if you don't post a journal today i'm going to lose it. #{streak} days on the line. do it for the fish. do it for ME.",
      ":oi: hey #{name}! soup here, reporting live from the bottom of an empty bowl :< your #{streak}-day streak needs you TODAY",
      ":oi: #{name}!! it's been a whole day and i've seen zero koi. ZERO. your #{streak}-day streak is at risk and i'm at risk of fading away :<",
      ":oi: knock knock. who's there. it's soup. soup who. soup who is HUNGRY and needs #{name} to post a journal entry before their #{streak}-day streak ends :<",
      ":oi: #{name}! i asked the other fish and they said you haven't journaled today. your #{streak}-day streak said \"tell them i miss them\" :<",
      ":politefella: hi #{name} can your journal today i'm a tad bit hungry kthxbye."
    ]
    variants.sample
  end

  private_class_method def self.announce_goal_completed(user, target_days)
    emoji = [ ":yayayayayay:", ":oi:" ].sample
    SlackMsgJob.perform_later(STREAK_ANNOUNCEMENT_CHANNEL, "#{emoji} <@#{user.slack_id}> completed their #{target_days}-day streak!! Congratulations!")
  end

  private_class_method def self.announce_goal_broken(user, target_days)
    SlackMsgJob.perform_later(STREAK_ANNOUNCEMENT_CHANNEL, ":shocked: <@#{user.slack_id}> broke their #{target_days}-day streak goal. </3 I NEED MORE FISH!")
  end

  private_class_method def self.streak_length_ending_at(user, end_date)
    days = StreakDay.where(user: user).streak_counting.where("date <= ?", end_date).reverse_chronological.pluck(:date)
    return 0 if days.empty? || days.first != end_date

    count = 0
    expected = end_date
    days.each do |date|
      break unless date == expected
      count += 1
      expected -= 1.day
    end
    count
  end
end
