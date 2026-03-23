class LookoutSessionsController < ApplicationController
  skip_after_action :verify_authorized # No index action — blanket skip required (Rails 8.1 callback validation)
  skip_after_action :verify_policy_scoped # No index action — blanket skip required (Rails 8.1 callback validation)

  def new
    skip_authorization # Any authenticated user can create a session; no resource to authorize against

    session_data = LookoutService.create_session(metadata: { user_id: current_user.id })
    unless session_data
      redirect_to path_path, alert: "Failed to create lookout session"
      return
    end

    token = session_data["token"]
    current_user.update!(pending_lookout_tokens: current_user.pending_lookout_tokens + [ token ])

    redirect_to record_lookout_sessions_path(token: token)
  end

  def record
    skip_authorization # Ownership verified via pending_lookout_tokens inclusion check below
    token = params[:token]

    unless current_user.pending_lookout_tokens.include?(token)
      redirect_to path_path, alert: "Session not found"
      return
    end

    session_data = LookoutService.get_session(token)

    unless session_data
      redirect_to path_path, alert: "Invalid recording session"
      return
    end

    render inertia: "lookout_sessions/show", props: {
      lookout_session: {
        token: token,
        status: session_data.dig("status") || "pending"
      },
      lookout_api_url: LookoutService.host,
      return_to: params[:return_to]
    }
  end
end
