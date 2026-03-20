class CollapseSessionsController < ApplicationController
  skip_after_action :verify_authorized # No index action — blanket skip required (Rails 8.1 callback validation)
  skip_after_action :verify_policy_scoped # No index action — blanket skip required (Rails 8.1 callback validation)

  def new
    authorize CollapseTimelapse, :create?

    session_data = CollapseService.create_session(metadata: { user_id: current_user.id })
    unless session_data
      redirect_back fallback_location: new_journal_entry_path, alert: "Failed to create collapse session"
      return
    end

    collapse = current_user.collapse_timelapses.create!(
      session_token: session_data["token"],
      collapse_session_id: session_data["sessionId"],
      status: "pending"
    )

    redirect_to collapse_session_path(collapse)
  end

  def show
    @collapse = current_user.collapse_timelapses.find(params[:id])
    authorize @collapse

    render inertia: "collapse_sessions/show", props: {
      collapse_session: {
        id: @collapse.id,
        token: @collapse.session_token,
        status: @collapse.status
      },
      collapse_api_url: CollapseService.host,
      return_to: params[:return_to]
    }
  end

  def update
    @collapse = current_user.collapse_timelapses.find(params[:id])
    authorize @collapse

    @collapse.refetch_data!
    render json: { status: @collapse.status }
  rescue ActiveRecord::RecordNotFound
    render json: { error: "Session not found" }, status: :not_found
  end
end
