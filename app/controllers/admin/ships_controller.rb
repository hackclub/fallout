class Admin::ShipsController < Admin::ApplicationController
  before_action :set_ship, only: %i[show edit update]

  def index
    @pagy, @ships = pagy(policy_scope(Ship).includes(:project, :reviewer, project: :user).order(created_at: :desc))

    render inertia: {
      ships: @ships.map { |s| serialize_ship_row(s) },
      pagy: pagy_props(@pagy)
    }
  end

  def show
    authorize @ship

    render inertia: {
      ship: serialize_ship_detail(@ship),
      can: { update: policy(@ship).update? }
    }
  end

  def edit
    authorize @ship

    render inertia: {
      ship: {
        id: @ship.id,
        status: @ship.status,
        feedback: @ship.feedback.to_s,
        justification: @ship.justification.to_s,
        approved_seconds: @ship.approved_seconds,
        project_name: @ship.project.name,
        user_display_name: @ship.project.user.display_name
      },
      statuses: Ship.statuses.keys
    }
  end

  def update
    authorize @ship

    if @ship.update(ship_params)
      redirect_to admin_ship_path(@ship), notice: "Ship updated."
    else
      redirect_back fallback_location: edit_admin_ship_path(@ship), inertia: { errors: @ship.errors.messages }
    end
  end

  private

  def set_ship
    @ship = Ship.includes(:reviewer, project: :user).find(params[:id])
  end

  def ship_params
    params.expect(ship: [ :status, :feedback, :justification, :approved_seconds ])
  end

  def serialize_ship_row(ship)
    {
      id: ship.id,
      project_name: ship.project.name,
      user_display_name: ship.project.user.display_name,
      status: ship.status,
      reviewer_display_name: ship.reviewer&.display_name,
      created_at: ship.created_at.strftime("%b %d, %Y")
    }
  end

  def serialize_ship_detail(ship)
    {
      id: ship.id,
      status: ship.status,
      reviewer_display_name: ship.reviewer&.display_name,
      approved_seconds: ship.approved_seconds,
      feedback: ship.feedback,
      justification: ship.justification,
      frozen_demo_link: ship.frozen_demo_link,
      frozen_repo_link: ship.frozen_repo_link,
      project_name: ship.project.name,
      user_display_name: ship.project.user.display_name,
      created_at: ship.created_at.strftime("%B %d, %Y")
    }
  end
end
