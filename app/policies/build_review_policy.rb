# frozen_string_literal: true

class BuildReviewPolicy < ApplicationPolicy
  def index?
    admin? || staff_reviewer?
  end

  def show?
    admin? || staff_reviewer?
  end

  def update?
    record.pending? && (admin? || active_claimer?) # Only pending reviews can be modified
  end

  def heartbeat?
    admin? || active_claimer?
  end

  private

  def active_claimer?
    record.claimed_by?(user)
  end

  def staff_reviewer?
    user&.can_review?(:build_review) # Only pass2 reviewers (and admins) can access this queue
  end

  class Scope < ApplicationPolicy::Scope
    def resolve
      if user&.can_review?(:build_review)
        scope.where.not(ship_id: Ship.where(project_id: ProjectFlag.select(:project_id)).select(:id))
      else
        scope.none
      end
    end
  end
end
