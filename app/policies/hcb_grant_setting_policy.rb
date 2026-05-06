class HcbGrantSettingPolicy < ApplicationPolicy
  # Admins can view settings; only the hcb role can change them. Edits here affect
  # every future grant card issuance (lock settings, conversion rates, etc.), so
  # they're gated on the same role that moves money.
  def show? = admin?
  def update? = hcb?

  private

  def hcb?
    user&.hcb?
  end
end
