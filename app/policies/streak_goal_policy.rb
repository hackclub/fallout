class StreakGoalPolicy < ApplicationPolicy
  def show?
    owner?
  end

  def create?
    owner?
  end

  def destroy?
    owner?
  end
end
