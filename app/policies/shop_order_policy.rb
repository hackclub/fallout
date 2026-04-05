# frozen_string_literal: true

class ShopOrderPolicy < ApplicationPolicy
  def index?
    admin? # Order list is admin-only; users see their orders via their profile
  end

  def show?
    admin? || record.user == user # Users can view their own orders
  end

  def create?
    !user.trial? && Flipper.enabled?(:shop, user) # Full users only; also gated by shop feature flag
  end

  def update?
    admin? # Only admins can change order state
  end

  class Scope < ApplicationPolicy::Scope
    def resolve
      return scope.where(user: user) unless user.admin?

      scope.all
    end
  end
end
