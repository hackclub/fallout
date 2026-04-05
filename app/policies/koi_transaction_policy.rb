# frozen_string_literal: true

class KoiTransactionPolicy < ApplicationPolicy
  def index?
    admin? # Admins can view all transactions; user history is shown via admin user page
  end

  def create?
    admin? # Only admins create manual adjustments
  end

  class Scope < ApplicationPolicy::Scope
    def resolve
      return scope.where(user: user) unless user.admin?

      scope.all
    end
  end
end
