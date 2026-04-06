# frozen_string_literal: true

class ShipPolicy < ApplicationPolicy
  def index?
    admin? || staff_reviewer?
  end

  def show?
    admin? || staff_reviewer? || owner? || assigned_reviewer?
  end

  def create?
    return false if user&.trial?
    admin? || owner?
  end

  def update?
    admin? # Only admins can directly edit ships — reviewers use the review pipeline
  end

  def destroy?
    admin?
  end

  private

  def owner?
    record.project.user == user
  end

  def assigned_reviewer?
    record.reviewer == user
  end

  def staff_reviewer?
    user&.reviewer?
  end

  class Scope < ApplicationPolicy::Scope
    def resolve
      if user&.admin?
        scope.all
      elsif user&.reviewer?
        scope.where.not(project_id: ProjectFlag.select(:project_id)) # reviewers cannot see flagged-project ships, consistent with review queue scopes
      else
        return scope.none unless user
        scope.for_user(user).or(scope.where(reviewer: user))
      end
    end
  end
end
