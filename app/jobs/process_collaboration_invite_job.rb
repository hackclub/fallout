class ProcessCollaborationInviteJob < ApplicationJob
  queue_as :default

  # Performs the "is this email a known user / claim / send mail" branching out-of-band
  # so the controller response time doesn't leak whether the email maps to a verified user.
  def perform(pending_invite_id)
    pending = PendingCollaborationInvite.find_by(id: pending_invite_id)
    return unless pending

    invitee = User.verified.kept.find_by(email: pending.invitee_email)

    if invitee
      begin
        pending.claim!(invitee)
      rescue ActiveRecord::RecordInvalid => e
        # Invitee already has a pending CollaborationInvite (or is already a collaborator).
        # Nothing to do — keep the pending invite as-is and skip mail so we don't spam.
        Rails.logger.warn("Skipping claim for pending invite #{pending.id}: #{e.message}")
        return
      end
      CollaborationInviteMailer.with(pending_invite: pending, invitee: invitee).invite_existing_user.deliver_later
    else
      CollaborationInviteMailer.with(pending_invite: pending).invite_new_user.deliver_later
    end
  end
end
