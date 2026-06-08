class Admin::ReviewerWeekResolutionsController < Admin::ApplicationController
  skip_after_action :verify_authorized   # No index action; authorize called explicitly below
  skip_after_action :verify_policy_scoped # No index action

  before_action :set_reviewer

  def create
    resolution = @reviewer.reviewer_week_resolutions.build(
      week_start: params[:week_start],
      reason:     params[:reason].presence,
      author:     current_user
    )
    authorize resolution
    resolution.save!
    redirect_back fallback_location: admin_reviewer_path(@reviewer) # Lets this be triggered from the reviewer page or the dashboard and return to the same spot
  end

  def bulk_create
    week_starts = Array(params[:week_starts]).compact_blank
    reason = params[:reason].presence

    week_starts.each do |week_start|
      resolution = @reviewer.reviewer_week_resolutions.find_or_initialize_by(week_start: week_start)
      next if resolution.persisted?
      resolution.author = current_user
      resolution.reason = reason
      authorize resolution, :create?
      resolution.save!
    end

    redirect_back fallback_location: admin_reviewer_path(@reviewer) # Lets this be triggered from the reviewer page or the dashboard and return to the same spot
  end

  def destroy
    resolution = @reviewer.reviewer_week_resolutions.find(params[:id])
    authorize resolution
    resolution.destroy!
    redirect_back fallback_location: admin_reviewer_path(@reviewer) # Lets this be triggered from the reviewer page or the dashboard and return to the same spot
  end

  private

  def set_reviewer
    @reviewer = User.find(params[:reviewer_id])
  end
end
