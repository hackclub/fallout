# frozen_string_literal: true

class OnboardingResponsePolicy < ApplicationPolicy
  def create?
    user.present?
  end

  def update?
    owner? # only the user who created the onboarding response can update it
  end

  class Scope < ApplicationPolicy::Scope
    def resolve
      scope.where(user: user)
    end
  end
end
