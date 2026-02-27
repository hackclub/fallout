class ProjectsController < ApplicationController
  allow_trial_access
  before_action :set_project, only: %i[show edit update destroy]

  def index
    scope = policy_scope(Project).includes(:user, :ships)
    scope = scope.search(params[:query]) if params[:query].present?
    @pagy, @projects = pagy(scope.order(created_at: :desc))

    render inertia: {
      projects: @projects.map { |p| serialize_project_card(p) },
      pagy: pagy_props(@pagy),
      query: params[:query].to_s
    }
  end

  def show
    authorize @project

    render inertia: {
      project: serialize_project_detail(@project),
      can: {
        update: policy(@project).update?,
        destroy: policy(@project).destroy?
      }
    }
  end

  def new
    @project = current_user.projects.build
    authorize @project

    render inertia: "projects/form", props: {
      project: { name: "", description: "", demo_link: "", repo_link: "", is_unlisted: false, tags: [] },
      title: "New Project",
      submit_url: projects_path,
      method: "post"
    }
  end

  def create
    @project = current_user.projects.build(project_params)
    authorize @project

    if @project.save
      redirect_to @project, notice: "Project created."
    else
      redirect_back fallback_location: new_project_path, inertia: { errors: @project.errors.messages }
    end
  end

  def edit
    authorize @project

    render inertia: "projects/form", props: {
      project: {
        id: @project.id,
        name: @project.name,
        description: @project.description.to_s,
        demo_link: @project.demo_link.to_s,
        repo_link: @project.repo_link.to_s,
        is_unlisted: @project.is_unlisted,
        tags: @project.tags
      },
      title: "Edit Project",
      submit_url: project_path(@project),
      method: "patch"
    }
  end

  def update
    authorize @project

    if @project.update(project_params)
      redirect_to @project, notice: "Project updated."
    else
      redirect_back fallback_location: edit_project_path(@project), inertia: { errors: @project.errors.messages }
    end
  end

  def destroy
    authorize @project
    @project.discard
    redirect_to projects_path, notice: "Project deleted."
  end

  private

  def set_project
    @project = Project.find(params[:id])
  end

  def project_params
    params.expect(project: [ :name, :description, :demo_link, :repo_link, :is_unlisted, tags: [] ])
  end

  def serialize_project_card(project)
    {
      id: project.id,
      name: project.name,
      description: project.description&.truncate(200),
      is_unlisted: project.is_unlisted,
      tags: project.tags,
      user_display_name: project.user.display_name,
      ships_count: project.ships.size
    }
  end

  def serialize_project_detail(project)
    {
      id: project.id,
      name: project.name,
      description: project.description,
      demo_link: project.demo_link,
      repo_link: project.repo_link,
      is_unlisted: project.is_unlisted,
      tags: project.tags,
      user_display_name: project.user.display_name,
      created_at: project.created_at.strftime("%B %d, %Y")
    }
  end
end
