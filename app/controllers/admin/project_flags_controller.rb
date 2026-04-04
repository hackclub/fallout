class Admin::ProjectFlagsController < Admin::ApplicationController
  before_action :require_admin!, only: [ :index ] # Only admins can view the flagged projects queue

  def index
    flags = policy_scope(ProjectFlag)
      .includes(:user, project: :user)
      .order(created_at: :desc)
    @pagy, @flags = pagy(flags)

    render inertia: {
      flags: @flags.map { |f| serialize_flag(f) },
      pagy: pagy_props(@pagy)
    }
  end

  def create
    @project = Project.find(params[:project_flag][:project_id])
    @flag = @project.project_flags.build(flag_params)
    @flag.user = current_user
    authorize @flag

    if @flag.save
      render json: serialize_flag(@flag), status: :created
    else
      render json: { errors: @flag.errors.messages }, status: :unprocessable_entity
    end
  end

  private

  def flag_params
    params.require(:project_flag).permit(:project_id, :ship_id, :review_stage, :reason)
  end

  def serialize_flag(flag)
    {
      id: flag.id,
      project_id: flag.project_id,
      project_name: flag.project.name,
      user_display_name: flag.project.user.display_name,
      flagged_by_display_name: flag.user.display_name,
      flagged_by_avatar: flag.user.avatar,
      ship_id: flag.ship_id,
      review_stage: flag.review_stage,
      reason: flag.reason,
      created_at: flag.created_at.iso8601
    }
  end
end
