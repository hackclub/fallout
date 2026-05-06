# frozen_string_literal: true

class CollaborationInvitePolicy < ApplicationPolicy
  def show?
    return false unless collaborators_enabled? # Entire invite UI is flag-gated
    admin? || record.invitee_id == user&.id || record.inviter_id == user&.id
  end

  def accept?
    collaborators_enabled? && user.present? && record.invitee_id == user.id && record.pending?
  end

  def decline?
    collaborators_enabled? && user.present? && record.invitee_id == user.id && record.pending?
  end

  def revoke?
    return false unless collaborators_enabled? && user.present? && record.pending?

    record.inviter_id == user.id # User-facing invite revocation stays with the inviter; admins use admin workflows.
  end
end
