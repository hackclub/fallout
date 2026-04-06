class Admin::ProjectFlagsController < Admin::ApplicationController
  before_action :require_admin! # Blanket admin requirement — staff create is explicitly relaxed below
  skip_before_action :require_admin!, only: [ :create ] # Reviewers can flag projects from the review UI

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

  def destroy
    @flag = ProjectFlag.find(params[:id])
    authorize @flag
    @flag.destroy!
    redirect_to admin_project_flags_path, notice: "Flag removed."
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
