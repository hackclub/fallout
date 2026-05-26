class Api::V1::UsersController < Api::V1::BaseController
  def index
    users = User.where.not(slack_id: nil)
      .includes(:critters)
      .order(:display_name)

    user_ids = users.map(&:id)
    koi_data = batch_koi(user_ids)
    streak_days = batch_streak_days(user_ids)

    render json: {
      data: users.map { |u|
        serialize_user(
          u,
          koi: user_koi(u, koi_data),
          streak: compute_streak(u, streak_days[u.id] || [])
        )
      }
    }
  end

  def show
    user = User.find_by!(slack_id: params[:id])
    render json: {
      data: serialize_user(user, koi: user.koi, streak: StreakDay.current_streak(user))
    }
  rescue ActiveRecord::RecordNotFound
    render json: { error: "User not found" }, status: :not_found
  end

  private

  def authenticate_api_key!
    api_key = request.headers["Authorization"]&.delete_prefix("Bearer ")
    unless api_key.present? && ActiveSupport::SecurityUtils.secure_compare(api_key, ENV.fetch("CRITTERS_API_KEY"))
      render json: { error: "Unauthorized" }, status: :unauthorized
    end
  end

  def batch_koi(user_ids)
    {
      earned: KoiTransaction.where(user_id: user_ids).group(:user_id).sum(:amount),
      spent_shop: ShopOrder.joins(:shop_item)
        .where(user_id: user_ids, shop_items: { currency: "koi" })
        .where.not(state: :rejected)
        .group(:user_id)
        .sum("frozen_price * quantity"),
      spent_grants: ProjectGrantOrder.kept
        .where(user_id: user_ids)
        .where.not(state: :rejected)
        .group(:user_id)
        .sum(:frozen_koi_amount)
    }
  end

  def batch_streak_days(user_ids)
    StreakDay.where(user_id: user_ids)
      .streak_counting
      .where("date <= ?", Date.tomorrow)
      .order(date: :desc)
      .pluck(:user_id, :date)
      .group_by(&:first)
      .transform_values { _1.map(&:last) }
  end

  def user_koi(user, koi_data)
    return 0 if user.trial?

    (koi_data[:earned][user.id] || 0) -
      (koi_data[:spent_shop][user.id] || 0) -
      (koi_data[:spent_grants][user.id] || 0)
  end

  def compute_streak(user, days)
    today = Time.current.in_time_zone(user.timezone).to_date
    days = days.select { |d| d <= today }
    return 0 if days.empty?

    yesterday = today - 1.day
    most_recent = days.first
    start_from = if most_recent == today
      today
    elsif most_recent == yesterday
      yesterday
    else
      return 0
    end

    count = 0
    expected = start_from
    days.each do |date|
      break unless date == expected
      count += 1
      expected -= 1.day
    end
    count
  end

  def serialize_user(user, koi:, streak:)
    critter_counts = user.critters.group_by(&:variant).transform_values(&:count)

    {
      slack_id: user.slack_id,
      display_name: user.display_name,
      koi:,
      gold: user.gold,
      streak:,
      critters: {
        total: user.critters.size,
        shiny_count: user.critters.count(&:shiny?),
        variants: critter_counts
      }
    }
  end
end
