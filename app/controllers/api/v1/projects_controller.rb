class Api::V1::ProjectsController < Api::V1::BaseController
  include Pagy::Method

  def index
    scope = Project.kept.listed.order(created_at: :desc)
    scope = scope.search(params[:query]) if params[:query].present?
    @pagy, @projects = pagy(scope)

    render json: {
      data: @projects.as_json(only: [ :id, :name, :description, :tags, :demo_link, :repo_link, :created_at, :updated_at ]),
      pagination: @pagy.data_hash(data_keys: %i[count page limit last in from to previous next])
    }
  end

  def show
    @project = Project.kept.listed.find(params[:id])

    render json: {
      data: @project.as_json(only: [ :id, :name, :description, :tags, :demo_link, :repo_link, :created_at, :updated_at ])
    }
  end
end
