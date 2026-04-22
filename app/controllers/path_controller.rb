class PathController < ApplicationController
  allow_trial_access only: %i[index] # Trial users can view their path
  skip_after_action :verify_authorized, only: %i[index] # No authorizable resource
  skip_after_action :verify_policy_scoped, only: %i[index] # No scoped collection

  def index
    mail_intro_id = deliver_mail_intro
    show_feedback_banner = !feedback_form_filled?(current_user.email)

    # Include both owned and collaborated journal entries for path progression
    owned = current_user.journal_entries.kept
    collaborated_ids = if collaborators_enabled?
      Collaborator.kept.where(user: current_user, collaboratable_type: "JournalEntry").select(:collaboratable_id)
    end
    journal_entries = if collaborated_ids
      owned.or(JournalEntry.kept.where(id: collaborated_ids))
    else
      owned
    end.includes(:critters).order(:created_at)

    render inertia: {
      user: {
        display_name: current_user.display_name,
        email: current_user.email,
        koi: current_user.koi,
        avatar: current_user.avatar
      },
      has_projects: current_user.projects.kept.exists? || (collaborators_enabled? && Collaborator.kept.where(user: current_user, collaboratable_type: "Project").exists?),
      journal_entry_count: journal_entries.size,
      # Critter variant per journal entry (by creation order), nil if no critter was awarded
      critter_variants: journal_entries.map { |je| je.critters.find { |c| c.user_id == current_user.id }&.variant },
      pending_dialog: pending_dialog_key(journal_entries),
      mail_intro_id: mail_intro_id,
      show_feedback_banner: show_feedback_banner
    }
  end

  private

  NUDGE_INTERVAL_DAYS = 12

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

  def feedback_form_filled?(email)
    api_key = ENV["AIRTABLE_API_KEY"]
    base_id = ENV["AIRTABLE_BASE_ID"]
    return false unless api_key && base_id

    filled = Rails.cache.fetch("feedback_form_filled:#{email}", expires_in: 1.hour) do
      safe_email = email.gsub("'", "\\\\'")
      encoded_formula = CGI.escape("{email}='#{safe_email}'")
      uri = URI("https://api.airtable.com/v0/#{base_id}/tblVadboSQpgeJpTL?filterByFormula=#{encoded_formula}&fields[]=email&maxRecords=1")
      response = Net::HTTP.get_response(uri, "Authorization" => "Bearer #{api_key}")
      if response.is_a?(Net::HTTPSuccess)
        records = JSON.parse(response.body)["records"]
        records.is_a?(Array) && records.any?
      else
        Rails.logger.error("Airtable feedback_form check error: #{response.code}")
        false
      end
    end

    # Promote to a permanent cache entry once filled — this state never reverts
    Rails.cache.write("feedback_form_filled:#{email}", true) if filled
    filled
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
