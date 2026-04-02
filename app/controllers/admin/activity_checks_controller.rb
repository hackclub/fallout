class Admin::ActivityChecksController < Admin::ApplicationController
  # No index action — blanket skip to avoid ActionNotFound (see CLAUDE.md)
  skip_after_action :verify_authorized
  skip_after_action :verify_policy_scoped

  def new
    skip_authorization
    render inertia: {}
  end

  def create
    skip_authorization

    video = params.require(:video)
    result = TimelapseActivityChecker.run_on_file(video.tempfile)

    render inertia: "admin/activity_checks/new", props: {
      results: {
        inactive_frames: result[:inactive_frames],
        total_frames: result[:total_frames],
        inactive_percentage: result[:inactive_percentage],
        segments: result[:segments]
      }
    }
  end
end
