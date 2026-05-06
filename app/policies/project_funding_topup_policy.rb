class ProjectFundingTopupPolicy < ApplicationPolicy
  # Ledger rows are read through Admin::ProjectGrants::OrdersController#index via
  # policy_scope. Write access is for manual adjustments (direction=in or out)
  # recorded by admins to reconcile real-world HCB activity outside the automated
  # settle flow. Money movement gate: hcb role only.
  def new? = hcb?
  def create? = hcb?

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
