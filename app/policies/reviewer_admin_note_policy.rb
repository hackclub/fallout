class ReviewerAdminNotePolicy < ApplicationPolicy
  def create?
    admin?
  end

  def update?
    admin?
  end

  def destroy?
    admin?
  end
end
