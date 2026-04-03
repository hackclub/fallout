class ReviewerNotePolicy < ApplicationPolicy
  # Any staff reviewer can post notes on projects they review
  def create?
    admin? || staff_reviewer?
  end

  # Only the author or an admin can edit their own notes
  def update?
    admin? || author?
  end

  # Only the author or an admin can delete notes
  def destroy?
    admin? || author?
  end

  private

  def author?
    record.user_id == user&.id
  end

  def staff_reviewer?
    user&.reviewer?
  end
end
