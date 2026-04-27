# frozen_string_literal: true

class BulletinEventPolicy < ApplicationPolicy
  def index?
    staff? # Staff can view the admin list (read-only for non-admins)
  end

  def show?
    staff?
  end

  def create?
    admin? # Only admins can create events
  end

  def update?
    admin? # Only admins can edit events
  end

  def destroy?
    admin? # Only admins can delete events
  end

  def bulk_destroy?
    admin? # Only admins can bulk-delete expired events
  end

  def destroy_expired?
    admin? # Only admins can clear expired events
  end

  def start_now?
    admin? # Only admins can start a manual-mode event
  end

  def force_start_now?
    admin? # Only admins can force-start a scheduled event
  end

  def end_now?
    admin? # Only admins can end an event
  end

  class Scope < ApplicationPolicy::Scope
    def resolve
      scope.all
    end
  end
end
