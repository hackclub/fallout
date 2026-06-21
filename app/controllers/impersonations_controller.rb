class ImpersonationsController < ApplicationController
  # The exit path must work while `current_user` is the impersonated (non-staff) user, so it
  # lives outside the admin namespace and authorizes nothing — it only ever acts on the
  # current session. No `index` action, so skip both verification callbacks blanket-style.
  skip_after_action :verify_authorized
  skip_after_action :verify_policy_scoped

  def destroy
    unless impersonating?
      redirect_to root_path
      return
    end

    admin = true_user
    target_id = current_user&.id
    Rails.logger.info("[impersonation] stop admin=#{admin&.id} target=#{target_id} ip=#{request.remote_ip}")
    session[:user_id] = session.delete(:impersonator_id) # Restore the real admin's session
    redirect_to admin_user_path(target_id), notice: "Stopped impersonating."
  end
end
