# frozen_string_literal: true

class HcbTransactionPolicy < ApplicationPolicy
  def index?
    admin? || owner_of_card?
  end

  def show?
    admin? || owner_of_card?
  end

  def create?
    false
  end

  def update?
    false
  end

  def destroy?
    false
  end

  private

  def owner_of_card?
    record.hcb_grant_card&.user == user
  end

  class Scope < ApplicationPolicy::Scope
    def resolve
      return scope.all if user&.admin?

      scope.joins(:hcb_grant_card).where(hcb_grant_cards: { user_id: user&.id })
    end
  end
end
