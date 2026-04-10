class StreakGoalsController < ApplicationController
  skip_after_action :verify_authorized # No index action — blanket skip required (Rails 8.1 callback validation)
  skip_after_action :verify_policy_scoped # No index action — blanket skip required (Rails 8.1 callback validation)

  def show
    current_user.reload # Reload after reconciliation run in ApplicationController shared props
    goal = current_user.streak_goal
    current_streak = StreakDay.current_streak(current_user)
    streak_freezes = current_user.streak_freezes

    if goal
      authorize goal
      frozen_days = StreakDay.where(user: current_user, status: :frozen)
                             .where(date: goal.started_on..)
                             .count
      render inertia: "streak_goals/show", props: {
        goal: {
          target_days: goal.target_days,
          progress: goal.progress,
          frozen_days: frozen_days,
          completed: goal.completed?,
          started_on: goal.started_on.iso8601,
          notify_streak_events: goal.notify_streak_events
        },
        current_streak: current_streak,
        streak_freezes: streak_freezes,
        is_modal: request.headers["X-InertiaUI-Modal"].present?
      }
    else
      skip_authorization
      last_goal_event = current_user.streak_events
                                    .where(event_type: %w[goal_completed goal_broken])
                                    .order(created_at: :desc)
                                    .first
      render inertia: "streak_goals/show", props: {
        goal: nil,
        current_streak: current_streak,
        streak_freezes: streak_freezes,
        targets: StreakGoal::VALID_TARGETS,
        last_goal_event: last_goal_event&.then { |e|
          { type: e.event_type, target_days: e.metadata["target_days"] }
        },
        is_modal: request.headers["X-InertiaUI-Modal"].present?
      }
    end
  end

  def create
    goal = current_user.streak_goal
    if goal
      authorize goal, :destroy? # Changing goal requires permission to abandon old one
      goal.destroy!
    else
      skip_authorization
    end

    new_goal = current_user.create_streak_goal!(
      target_days: params[:target_days].to_i,
      started_on: Date.current.in_time_zone(current_user.timezone).to_date,
      notify_streak_events: params.fetch(:notify_streak_events, true)
    )

    if request.headers["X-InertiaUI-Modal"].present?
      head :no_content
    else
      redirect_to streak_goal_path, notice: "Committed to a #{new_goal.target_days}-day streak!"
    end
  end

  def destroy
    goal = current_user.streak_goal
    if goal
      authorize goal
      goal.destroy!
      nudge = current_user.dialog_campaigns.find_by(key: "streak_goal_nudge")
      nudge&.mark_seen!
    else
      skip_authorization
    end

    if request.headers["X-InertiaUI-Modal"].present?
      head :no_content
    else
      redirect_to streak_goal_path, notice: "Streak goal removed."
    end
  end
end
