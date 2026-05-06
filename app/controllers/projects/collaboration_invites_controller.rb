class Projects::CollaborationInvitesController < ApplicationController
  # No index action — blanket skip required (Rails 8.1 callback validation)
  skip_after_action :verify_authorized
  skip_after_action :verify_policy_scoped

  before_action :require_collaborators_feature! # Gated behind :collaborators feature flag
  before_action :set_project

  def create
    authorize @project, :manage_collaborators? # Only project owner can send invites

    email = params[:email]&.strip&.downcase

    # Always respond with the same success message to prevent email enumeration.
    # Invalid emails, self-invites, duplicates, and unknown addresses all appear identical.
    if email.present? && email.match?(URI::MailTo::EMAIL_REGEXP) && email != @project.user.email&.downcase
      unless PendingCollaborationInvite.pending.exists?(project: @project, invitee_email: email)
        pending = @project.pending_collaboration_invites.build(inviter: current_user, invitee_email: email)

        begin
          # Claim/mail branching happens in a background job so response timing doesn't
          # reveal whether `email` maps to a verified user.
          ProcessCollaborationInviteJob.perform_later(pending.id) if pending.save
        rescue ActiveRecord::RecordInvalid
          # Duplicate/invalid invites (TOCTOU race against the existence check above)
          # must not 500 — swallow silently so we preserve the uniform response that
          # prevents email enumeration.
        end
      end
    end

    redirect_back fallback_location: project_path(@project), notice: "Invite sent!"
  end

  def destroy
    invite = @project.collaboration_invites.find(params[:id])
    authorize invite, :revoke? # Only the inviter can revoke a pending invite from the user-facing project page
    invite.revoked!

    # Also revoke the associated pending invite so the email link shows "withdrawn"
    PendingCollaborationInvite.pending.where(collaboration_invite: invite).find_each(&:revoked!)

    redirect_back fallback_location: project_path(@project), notice: "Invite revoked."
  end

  private

  def set_project
    @project = Project.kept.find(params[:project_id])
  end

  def require_collaborators_feature!
    return if collaborators_enabled?
    redirect_back fallback_location: root_path, alert: "This feature is not available."
  end
end
