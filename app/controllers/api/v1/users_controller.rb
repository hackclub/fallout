class Api::V1::UsersController < Api::V1::BaseController
  # A key for the critters API (for the community pokidex)
  def authenticate_api_key!
    api_key = request.headers["Authorization"]&.delete_prefix("Bearer ")
    unless api_key.present? && ActiveSupport::SecurityUtils.secure_compare(api_key, ENV.fetch("CRITTERS_API_KEY"))
      render json: { error: "Unauthorized" }, status: :unauthorized
    end
  end
  def index
    users = User.where.not(slack_id: nil)
      .includes(:critters)
      .order(:display_name)

    render json: {
      data: users.map { |u| serialize_user(u) }
    }
  end

  def show
    user = User.find_by!(slack_id: params[:id])

    render json: { data: serialize_user(user) }
  rescue ActiveRecord::RecordNotFound
    render json: { error: "User not found" }, status: :not_found
  end

  private

  def serialize_user(user)
    critter_counts = user.critters.group_by(&:variant).transform_values(&:count)

    {
      slack_id: user.slack_id,
      display_name: user.display_name,
      koi: user.koi,
      gold: user.gold,
      streak: StreakDay.current_streak(user),
      critters: {
        total: user.critters.size,
        shiny_count: user.critters.count(&:shiny?),
        variants: critter_counts
      }
    }
  end
end
