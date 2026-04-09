# frozen_string_literal: true

class HcbGrantCardPolicy < ApplicationPolicy
  def index?
    admin?
  end

  def show?
    admin? || owner?
  end

  def create?
    admin?
  end

  def update?
    admin?
  end

  def destroy?
    false
  end

  class Scope < ApplicationPolicy::Scope
    def resolve
      return scope.all if user&.admin?

      scope.where(user: user)
    end
  end
end
