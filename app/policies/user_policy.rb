class UserPolicy < ApplicationPolicy
  def index?
    staff?
  end

  def show?
    staff? || record == user
  end

  def update?
    admin? || record == user
  end

  def update_roles?
    admin?
  end

  def destroy?
    admin? && record != user
  end

  class Scope < ApplicationPolicy::Scope
    def resolve
      if user&.staff?
        scope.all
      else
        scope.kept.where(id: user&.id)
      end
    end
  end
end
