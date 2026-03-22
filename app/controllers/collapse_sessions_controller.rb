class CollapseSessionsController < ApplicationController
  skip_after_action :verify_authorized # No index action — blanket skip required (Rails 8.1 callback validation)
  skip_after_action :verify_policy_scoped # No index action — blanket skip required (Rails 8.1 callback validation)

  def new
    skip_authorization # Any authenticated user can create a session; no resource to authorize against

    session_data = CollapseService.create_session(metadata: { user_id: current_user.id })
    unless session_data
      redirect_back fallback_location: new_journal_entry_path, alert: "Failed to create collapse session"
      return
    end

    token = session_data["token"]
    current_user.update!(pending_collapse_tokens: current_user.pending_collapse_tokens + [token])

    redirect_to record_collapse_sessions_path(token: token)
  end

  def record
    skip_authorization # Ownership verified via pending_collapse_tokens inclusion check below
    token = params[:token]

    unless current_user.pending_collapse_tokens.include?(token)
      redirect_to new_journal_entry_path, alert: "Session not found"
      return
    end

    session_data = CollapseService.get_session(token)

    render inertia: "collapse_sessions/show", props: {
      collapse_session: {
        token: token,
        status: session_data&.dig("status") || "pending"
      },
      collapse_api_url: CollapseService.host,
      return_to: params[:return_to]
    }
  end
end
