class SoupCampaignPolicy < ApplicationPolicy
  # Only admins can manage Soup campaigns
  def index? = admin?
  def show? = admin?
  def create? = admin?
  def new? = admin?
  def update? = admin? && record.draft?
  def edit? = update?
  def destroy? = admin? && record.draft?
  def send_campaign? = admin? && record.draft?
  def test_send? = admin?
  def cancel? = admin? && record.sending?

  class Scope < ApplicationPolicy::Scope
    def resolve
      return scope.none unless user&.admin?

      scope.all
    end
  end
end
