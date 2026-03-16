# frozen_string_literal: true

class LapseTimelapsePolicy < ApplicationPolicy
  def create?
    user.present? # any authenticated user — authorization is enforced at the parent resource level
  end

  def show?
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
