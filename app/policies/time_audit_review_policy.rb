# frozen_string_literal: true

class TimeAuditReviewPolicy < ApplicationPolicy
  def index?
    admin? || staff_reviewer?
  end

  def show?
    admin? || staff_reviewer?
  end

  def update?
    admin? || active_claimer?
  end

  # Heartbeat extends the claim — only the active claimer (or admin) can call it
  def heartbeat?
    admin? || active_claimer?
  end

  private

  # Requires an active (non-expired) claim, not just reviewer_id match
  def active_claimer?
    record.claimed_by?(user)
  end

  def staff_reviewer?
    user&.reviewer?
  end

  class Scope < ApplicationPolicy::Scope
    def resolve
      if user&.admin? || user&.reviewer?
        # Exclude reviews for flagged projects — they move to the admin flagged queue
        scope.where.not(ship_id: Ship.where(project_id: ProjectFlag.select(:project_id)).select(:id))
      else
        scope.none
      end
    end
  end
end
