class PathController < ApplicationController
  allow_trial_access only: %i[index] # Trial users can view their path
  skip_after_action :verify_authorized, only: %i[index] # No authorizable resource
  skip_after_action :verify_policy_scoped, only: %i[index] # No scoped collection

  # Scoped to path-only so other pages don't pay these queries on every load.
  inertia_share has_unread_mail: -> { # Drives the envelope badge on the path page
    next false unless current_user && !current_user.trial?
    MailMessage.visible_to(current_user)
              .where.not(id: current_user.mail_interactions.read.select(:mail_message_id))
              .exists?
  }
  inertia_share current_streak: -> { # Read-only — reconciliation happens in StreakReconciliationJob and StreakService.record_activity
    next 0 unless current_user && !current_user.trial?
    StreakDay.current_streak(current_user)
  }

  def index
    mail_intro_id = deliver_mail_intro || deliver_auto_open_mail

    # Include both owned and collaborated journal entries for path progression
    owned = current_user.journal_entries.kept
    collaborated_ids = if collaborators_enabled?
      Collaborator.kept.where(user: current_user, collaboratable_type: "JournalEntry").select(:collaboratable_id)
    end
    journal_entries = if collaborated_ids
      owned.or(JournalEntry.kept.where(id: collaborated_ids))
    else
      owned
    end.includes(:critters).order(:created_at).to_a # Materialize once — `.size` + `.map` + `pending_dialog_key.size` would otherwise re-query.

    render inertia: {
      user: {
        id: current_user.id, # Used by the frontend to subscribe to the per-user live-update stream
        display_name: current_user.display_name,
        koi: current_user.koi,
        gold: current_user.gold,
        avatar: current_user.custom_avatar.attached? ? url_for(current_user.custom_avatar) : current_user.avatar
      },
      has_projects: current_user.projects.kept.exists? || (collaborators_enabled? && Collaborator.kept.where(user: current_user, collaboratable_type: "Project").exists?),
      journal_entry_count: journal_entries.size,
      # Critter variant per journal entry (by creation order), nil if no critter was awarded
      critter_variants: journal_entries.map { |je| je.critters.find { |c| c.user_id == current_user.id }&.variant },
      pending_dialog: pending_dialog_key(journal_entries),
      mail_intro_id: mail_intro_id
    }
  end

  private

  NUDGE_INTERVAL_DAYS = 12

  def deliver_auto_open_mail
    return if current_user.trial?

    mail = MailMessage.visible_to(current_user)
      .where(auto_open: true)
      .where.not(id: current_user.mail_interactions.read.select(:mail_message_id))
      .order(created_at: :asc)
      .first

    return unless mail

    current_user.mail_interactions.find_or_initialize_by(mail_message: mail).update!(read_at: Time.current)
    mail.id
  end

  def deliver_mail_intro
    return if current_user.trial?

    created = false
    campaign = current_user.dialog_campaigns.find_or_create_by!(key: "mail_intro") { created = true }
    return unless created

    campaign.mark_seen!
    mail = MailDeliveryService.mail_intro(current_user)
    current_user.mail_interactions.create!(mail_message: mail, read_at: Time.current) # Pre-read so it doesn't trigger the unread badge
    mail.id
  end

  DIALOG_LOOKUP_KEYS = %w[sixty_hours streak_goal_completed first_journal streak_goal_nudge].freeze

  def pending_dialog_key(journal_entries)
    return nil if current_user.trial?

    # Batch-fetch all dialog campaigns we might check, instead of running a separate
    # find_by per key (was 4 sequential queries on every /path load).
    campaigns_by_key = current_user.dialog_campaigns.where(key: DIALOG_LOOKUP_KEYS).index_by(&:key)

    sixty = campaigns_by_key["sixty_hours"]
    return "sixty_hours" if sixty && !sixty.seen?

    if sixty.nil? && current_user.total_time_logged_seconds >= 60 * 3600
      current_user.dialog_campaigns.create!(key: "sixty_hours")
      return "sixty_hours"
    end

    completed = campaigns_by_key["streak_goal_completed"]
    return "streak_goal_completed" if completed && !completed.seen?

    first = campaigns_by_key["first_journal"]
    return "first_journal" if first && !first.seen?

    if journal_entries.size >= 1 && current_user.streak_goal.nil?
      nudge = campaigns_by_key["streak_goal_nudge"]
      if nudge.nil?
        current_user.dialog_campaigns.create!(key: "streak_goal_nudge")
        return "streak_goal_nudge"
      elsif nudge.seen? && nudge.seen_at < NUDGE_INTERVAL_DAYS.days.ago
        nudge.update!(seen_at: nil) # Reset so it triggers again
        return "streak_goal_nudge"
      elsif !nudge.seen?
        return "streak_goal_nudge"
      end
    end

    nil
  end
end
