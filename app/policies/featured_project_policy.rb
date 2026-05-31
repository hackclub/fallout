# frozen_string_literal: true

class FeaturedProjectPolicy < ApplicationPolicy
  def index?
    staff? # Staff can view the admin list (read-only for non-admins)
  end

  def show?
    staff?
  end

  def create?
    admin? # Only admins can feature a project
  end

  def update_note?
    admin? # Only admins can edit the curator note
  end

  def destroy?
    admin? # Only admins can unfeature (soft-delete)
  end

  def restore?
    admin? # Only admins can restore an unfeatured project
  end

  def reorder?
    admin? # Only admins can reorder the featured list
  end

  class Scope < ApplicationPolicy::Scope
    def resolve
      scope.all
    end
  end
end
