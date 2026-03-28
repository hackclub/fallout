class PathController < ApplicationController
  allow_trial_access only: %i[index] # Trial users can view their path
  skip_after_action :verify_authorized, only: %i[index] # No authorizable resource
  skip_after_action :verify_policy_scoped, only: %i[index] # No scoped collection

  def index
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
      # Journal entry IDs for retroactive critter rolls on completed path nodes
      journal_entry_ids: journal_entries.map(&:id)
    }
  end
end
