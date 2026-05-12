# frozen_string_literal: true

class GoldTransactionPolicy < ApplicationPolicy
  def index?
    admin?
  end

  def create?
    admin?
  end

  class Scope < ApplicationPolicy::Scope
    def resolve
      return scope.where(user: user) unless user.admin?

      scope.all
    end
  end
end
