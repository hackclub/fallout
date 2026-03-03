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
    admin? || staff_reviewer? || assigned_reviewer?
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
      if user&.admin? || user&.reviewer?
        scope.all
      else
        return scope.none unless user
        scope.for_user(user).or(scope.where(reviewer: user))
      end
    end
  end
end
