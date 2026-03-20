# frozen_string_literal: true

class CollapseTimelapsePolicy < ApplicationPolicy
  def create?
    user.present?
  end

  def show?
    admin? || owner?
  end

  def update?
    admin? || owner?
  end

  def destroy?
    admin? || owner?
  end

  class Scope < ApplicationPolicy::Scope
    def resolve
      if user&.admin?
        scope.all
      else
        scope.where(user: user)
      end
    end
  end
end
