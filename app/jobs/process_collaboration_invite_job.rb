class ProcessCollaborationInviteJob < ApplicationJob
  queue_as :default

  # Performs the "is this email a known user / claim / send mail" branching out-of-band
  # so the controller response time doesn't leak whether the email maps to a verified user.
  def perform(pending_invite_id)
    pending = PendingCollaborationInvite.find_by(id: pending_invite_id)
    return unless pending

    invitee = User.verified.kept.find_by(email: pending.invitee_email)
    pending.claim!(invitee) if invitee

    if invitee
      CollaborationInviteMailer.with(pending_invite: pending, invitee: invitee).invite_existing_user.deliver_later
    else
      CollaborationInviteMailer.with(pending_invite: pending).invite_new_user.deliver_later
    end
  end
end
