class PendingCollaborationInvitesController < ApplicationController
  allow_unauthenticated_access only: %i[show] # Email link must work without a session
  allow_trial_access only: %i[show] # Trial users see a verification prompt
  skip_after_action :verify_authorized # Token-based access, no Pundit resource
  skip_after_action :verify_policy_scoped # No index action; no policy-scoped queries

  before_action :set_pending_invite

  def show
    case @pending_invite.status
    when "revoked"
      render inertia: "pending_collaboration_invites/show", props: {
        state: "revoked",
        project_name: @pending_invite.project.name
      }
    when "claimed"
      # Only redirect to the real invite page if the user is logged in — otherwise show login prompt
      if current_user
        redirect_to collaboration_invite_path(@pending_invite.collaboration_invite)
      else
        session[:return_to] = pending_invite_path(@pending_invite.token)
        render inertia: "pending_collaboration_invites/show", props: {
          state: "unauthenticated",
          inviter_name: @pending_invite.inviter.display_name,
          inviter_avatar: @pending_invite.inviter.avatar,
          project_name: @pending_invite.project.name,
          sign_in_path: signin_path,
          trial_session_path: trial_session_path
        }
      end
    when "pending"
      handle_pending_invite
    end
  end

  private

  def set_pending_invite
    @pending_invite = PendingCollaborationInvite.find_by!(token: params[:token])
  rescue ActiveRecord::RecordNotFound
    redirect_to root_path, alert: "This invite link is not valid."
  end

  def handle_pending_invite
    if current_user.nil?
      session[:return_to] = pending_invite_path(@pending_invite.token)
      render inertia: "pending_collaboration_invites/show", props: {
        state: "unauthenticated",
        inviter_name: @pending_invite.inviter.display_name,
        inviter_avatar: @pending_invite.inviter.avatar,
        project_name: @pending_invite.project.name,
        sign_in_path: signin_path,
        trial_session_path: trial_session_path
      }
    elsif current_user.trial?
      session[:return_to] = pending_invite_path(@pending_invite.token)
      render inertia: "pending_collaboration_invites/show", props: {
        state: "trial",
        inviter_name: @pending_invite.inviter.display_name,
        inviter_avatar: @pending_invite.inviter.avatar,
        project_name: @pending_invite.project.name,
        sign_in_path: signin_path(login_hint: current_user.email)
      }
    else
      handle_verified_user
    end
  end

  def handle_verified_user
    if @pending_invite.invitee_email.downcase != current_user.email&.downcase
      render inertia: "pending_collaboration_invites/show", props: {
        state: "wrong_user",
        project_name: @pending_invite.project.name
      }
      return
    end

    invite = @pending_invite.claim!(current_user)
    redirect_to collaboration_invite_path(invite), notice: "You have a collaboration invite!"
  rescue ActiveRecord::RecordInvalid
    # Invitee already has a pending invite (or is already a collaborator) for this project —
    # surface a friendly message rather than a 500.
    existing = @pending_invite.project.collaboration_invites.pending.find_by(invitee: current_user)
    if existing
      redirect_to collaboration_invite_path(existing), notice: "You have a collaboration invite!"
    else
      redirect_to root_path, alert: "You are already a collaborator on this project."
    end
  end
end
