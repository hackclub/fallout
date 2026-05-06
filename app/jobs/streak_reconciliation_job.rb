# Runs daily to reconcile yesterday's streak for all users with streak history.
# Uses freeze if available, otherwise marks the day as missed and breaks the streak.
class StreakReconciliationJob < ApplicationJob
  queue_as :background

  def perform
    User.verified.kept.joins(:streak_days).distinct.find_each do |user|
      StreakService.reconcile_missed_days(user)
    rescue StandardError => e
      ErrorReporter.capture_exception(e, contexts: { streak: { user_id: user.id, action: "reconcile" } })
    end
  end
end
