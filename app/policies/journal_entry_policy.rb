# frozen_string_literal: true

class JournalEntryPolicy < ApplicationPolicy
  def create?
    return false unless user.present?
    return true if record.project&.user_id == user.id # Project owner can always create (preserves trial user behavior)
    collaborators_enabled? && !user.trial? && record.project&.collaborator?(user) # Collaborators must be verified and flag-gated
  end

  def show?
    admin? || owner? || (collaborators_enabled? && record.project&.owner_or_collaborator?(user)) # Collaborator visibility is flag-gated
  end

  def update?
    return false unless owner?

    record.project&.user_id == user.id || (collaborators_enabled? && record.project&.owner_or_collaborator?(user)) # Collaborator edit access is flag-gated
  end

  def switch_project?
    return false if record.ship_id.present? # Shipped entries are locked to preserve submission history
    update?
  end

  def destroy?
    return false unless owner?
    return false if record.project&.ships&.approved&.exists? # Preserve submission history on approved projects

    record.project&.user_id == user.id || (collaborators_enabled? && record.project&.owner_or_collaborator?(user)) # Collaborator delete access is flag-gated
  end

  class Scope < ApplicationPolicy::Scope
    def resolve
      if user&.admin?
        scope.all
      else
        owned_project_ids = Project.kept.where(user: user).select(:id)
        base = scope.kept.where(user: user)
          .or(scope.kept.where(project_id: owned_project_ids)) # Entries on projects user owns
        if collaborators_enabled?
          collaborated_project_ids = Collaborator.kept.where(user: user, collaboratable_type: "Project").select(:collaboratable_id)
          base = base.or(scope.kept.where(project_id: collaborated_project_ids)) # Entries on projects user collaborates on (flag-gated)
        end
        base
      end
    end
  end
end
