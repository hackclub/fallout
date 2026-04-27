# frozen_string_literal: true

class ProjectPolicy < ApplicationPolicy
  def index?
    true
  end

  def onboarding?
    true # Any authenticated user can view the project onboarding modal
  end

  def show?
    return false if record.discarded? && !admin?
    staff? || !record.is_unlisted || owner? || (collaborators_enabled? && record.collaborator?(user)) # Collaborators can see unlisted projects they're on (flag-gated)
  end

  def create?
    return false unless user.present?
    return !user.projects.kept.exists? if user.trial?

    true
  end

  def update?
    return false if record.discarded?

    owner? # User-facing project edits are owner-only; admins use /admin or Airtable.
  end

  def destroy?
    return false if record.discarded?

    owner? # User-facing project deletes are owner-only; admins use /admin or Airtable.
  end

  def ship?
    return false if record.discarded?
    return false if record.ships.where(status: %i[pending awaiting_identity]).exists? # Block while a submission is queued or held for identity verification
    return false unless user.present?

    !user.trial? && owner? # Only verified project owners can submit for review
  end

  def manage_collaborators?
    return false unless user.present? && !user.trial? && collaborators_enabled?

    owner? # Only verified project owners manage collaborators from the user-facing project page.
  end

  class Scope < ApplicationPolicy::Scope
    def resolve
      if user&.staff?
        scope.all
      else
        base = scope.kept.listed.or(scope.kept.where(user: user))
        if collaborators_enabled?
          collaborated_ids = Collaborator.kept.where(user: user, collaboratable_type: "Project").select(:collaboratable_id)
          base = base.or(scope.kept.where(id: collaborated_ids)) # Include projects user collaborates on (flag-gated)
        end
        base
      end
    end
  end
end
