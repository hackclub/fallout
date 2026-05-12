class HcbDonationRequestPolicy < ApplicationPolicy
  # User-facing actions: a full-account user can create a donation intent for
  # themselves, gated by the hcb_top_ups Flipper flag (independent of
  # :grant_fulfillment so ops can kill-switch top-ups without disabling grants).
  def index? = flag_enabled? && full_user?
  def new? = flag_enabled? && full_user?
  def create? = flag_enabled? && full_user? && record.user_id == user&.id

  class Scope < ApplicationPolicy::Scope
    # Admins see everything; full users (with flag on) see only their own. Others get nothing.
    def resolve
      return scope.all if user&.admin?
      return scope.none unless user.present? && !user.trial? && Flipper.enabled?(:hcb_top_ups, user)

      scope.where(user_id: user.id)
    end
  end

  private

  def full_user?
    user.present? && !user.trial?
  end

  def flag_enabled?
    user.present? && Flipper.enabled?(:hcb_top_ups, user)
  end
end
