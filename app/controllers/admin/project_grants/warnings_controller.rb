class Admin::ProjectGrants::WarningsController < Admin::ApplicationController
  before_action :require_admin! # Admin-gated surface; resolve further gated on hcb role in policy.

  # Collection-only controller: warnings are listed + managed from the Project
  # Grants page. No :index action here (it's inlined into orders#index props).
  # The blanket skip avoids Rails 8.1's "action not found in except:" raise.
  skip_after_action :verify_authorized
  skip_after_action :verify_policy_scoped

  # POST /admin/project_grants/warnings/:id/resolve
  # Marks a warning resolved with the current user as resolver. Note is optional
  # but encouraged — especially for ledger_divergence where the fix might span
  # multiple actions (manual HCB move + ledger adjustment).
  def resolve
    @warning = ProjectGrantWarning.find(params[:id])
    authorize @warning, :resolve?

    @warning.resolve!(admin: current_user, note: params[:note].presence)
    redirect_back fallback_location: admin_project_grants_orders_path,
      notice: "Warning marked resolved."
  end
end
