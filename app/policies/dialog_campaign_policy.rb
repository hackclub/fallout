class DialogCampaignPolicy < ApplicationPolicy
  def mark_seen?
    owner?
  end
end
