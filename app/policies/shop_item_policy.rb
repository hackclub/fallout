# frozen_string_literal: true

class ShopItemPolicy < ApplicationPolicy
  def index?
    admin? || Flipper.enabled?(:shop, user) # Gated by shop feature flag; admins always have access
  end

  def show?
    admin? || Flipper.enabled?(:shop, user) # Gated by shop feature flag; admins always have access
  end

  def create?
    admin? # Only admins can create shop items
  end

  def update?
    admin? # Only admins can edit shop items
  end

  def destroy?
    admin? # Only admins can delete shop items
  end

  class Scope < ApplicationPolicy::Scope
    def resolve
      scope.all
    end
  end
end
