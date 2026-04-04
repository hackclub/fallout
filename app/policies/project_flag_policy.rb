# frozen_string_literal: true

class ProjectFlagPolicy < ApplicationPolicy
  def create?
    admin? || staff_reviewer?
  end

  def index?
    admin?
  end

  private

  def staff_reviewer?
    user&.reviewer?
  end

  class Scope < ApplicationPolicy::Scope
    def resolve
      if user&.admin?
        scope.all
      else
        scope.none
      end
    end
  end
end
