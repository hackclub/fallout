class Admin::YouTubeVideosController < Admin::ApplicationController
  # No index action — blanket skip to avoid ActionNotFound (see AGENTS.md)
  skip_after_action :verify_authorized
  skip_after_action :verify_policy_scoped

  def refetch
    video = YouTubeVideo.find(params[:id])
    authorize video, :refetch?

    video.refetch_data!
    render json: { ok: true, duration_seconds: video.duration_seconds }
  rescue ActiveRecord::RecordNotFound
    render json: { error: "Not found" }, status: :not_found
  rescue => e
    render json: { error: e.message }, status: :unprocessable_entity
  end
end
