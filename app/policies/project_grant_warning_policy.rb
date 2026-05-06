class ProjectGrantWarningPolicy < ApplicationPolicy
  # Admins can view warnings (no PII beyond user names/IDs we already expose on
  # orders pages). Only hcb role can mark them resolved, since "resolved" is an
  # assertion about the underlying money state.
  def index? = admin?
  def show? = admin?
  def resolve? = hcb?

  class Scope < ApplicationPolicy::Scope
    def resolve
      return scope.none unless user&.admin?

      scope.all
    end
  end

  private

  def hcb?
    user&.hcb?
  end
end
