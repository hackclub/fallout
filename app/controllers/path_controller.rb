class PathController < ApplicationController
  allow_trial_access only: %i[index] # Trial users can view their path
  skip_after_action :verify_authorized, only: %i[index] # No authorizable resource
  skip_after_action :verify_policy_scoped, only: %i[index] # No scoped collection

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

  def pending_dialog_key(journal_entries)
    return nil if current_user.trial?

    unseen_completed = current_user.dialog_campaigns.unseen.find_by(key: "streak_goal_completed")
    return "streak_goal_completed" if unseen_completed

    unseen_first = current_user.dialog_campaigns.unseen.find_by(key: "first_journal")
    return "first_journal" if unseen_first

    if journal_entries.size >= 1 && current_user.streak_goal.nil?
      campaign = current_user.dialog_campaigns.find_or_initialize_by(key: "streak_goal_nudge")
      if campaign.new_record?
        campaign.save!
        return "streak_goal_nudge"
      elsif campaign.seen? && campaign.seen_at < NUDGE_INTERVAL_DAYS.days.ago
        campaign.update!(seen_at: nil) # Reset so it triggers again
        return "streak_goal_nudge"
      elsif !campaign.seen?
        return "streak_goal_nudge"
      end
    end

    nil
  end
end
