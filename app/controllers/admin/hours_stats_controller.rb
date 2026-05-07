class Admin::HoursStatsController < Admin::ApplicationController
  before_action :require_admin! # admin only

  CACHE_KEY = "admin/hours_stats/%s"
  CACHE_TTL = 24.hours
  MODES = %w[logged build_approved].freeze

  def index
    skip_policy_scope 
    mode = MODES.include?(params[:mode]) ? params[:mode] : "logged"

    data = Rails.cache.fetch(format(CACHE_KEY, mode), expires_in: CACHE_TTL) do
      { buckets: compute_stats(mode), cached_at: Time.current.iso8601 }
    end

    render inertia: "admin/hours_stats/index", props: {
      buckets: data[:buckets].map { |range, users| { range: range, users: users } },
      cached_at: data[:cached_at],
      mode: mode
    }
  end

  def refresh
    skip_authorization 
    MODES.each { |m| Rails.cache.delete(format(CACHE_KEY, m)) }
    redirect_to admin_hours_stats_path, notice: "Stats refreshed."
  end

  private

  BUCKETS = { "1-10h" => [], "11-20h" => [], "21-30h" => [], "31-40h" => [], "41-50h" => [], "51-60h" => [], "60+" => [] }.freeze

  def bucket_for(hours)
    case hours
    when 1...11 then "1-10h"
    when 11...21 then "11-20h"
    when 21...31 then "21-30h"
    when 31...41 then "31-40h"
    when 41...51 then "41-50h"
    when 51...61 then "51-60h"
    else "60+"
    end
  end

  def compute_stats(mode)
    mode == "build_approved" ? compute_build_approved_stats : compute_logged_stats
  end

  def compute_logged_stats
    usr_ids = User.kept.pluck(:id)

    join_sql = "INNER JOIN projects ON journal_entries.project_id = projects.id"
    scope_conditions = {
      journal_entries: { discarded_at: nil },
      projects: { discarded_at: nil, user_id: usr_ids }
    }

    lapse_by_user = LapseTimelapse
      .joins(recording: :journal_entry)
      .joins(join_sql)
      .where(scope_conditions)
      .group("projects.user_id")
      .sum("lapse_timelapses.duration")

    yt_by_user = YouTubeVideo
      .joins(recording: :journal_entry)
      .joins(join_sql)
      .where(scope_conditions)
      .group("projects.user_id")
      .sum(Arel.sql("duration_seconds * stretch_multiplier"))

    lookout_by_user = LookoutTimelapse
      .joins(recording: :journal_entry)
      .joins(join_sql)
      .where(scope_conditions)
      .group("projects.user_id")
      .sum("lookout_timelapses.duration")

    manual_by_user = Project.kept.where(user_id: usr_ids).group(:user_id).sum(:manual_seconds)
    user_data = User.where(id: usr_ids).pluck(:id, :email, :slack_id)
                   .to_h { |id, email, slack_id| [ id, { email: email, slack_id: slack_id } ] }

    buckets = BUCKETS.transform_values { [] }

    usr_ids.each do |uid|
      total = lapse_by_user[uid].to_i + yt_by_user[uid].to_i + lookout_by_user[uid].to_i + manual_by_user[uid].to_i
      next if total < 3600

      h = total / 3600.0
      buckets[bucket_for(h)] << { email: user_data[uid][:email], slack_id: user_data[uid][:slack_id], hours: h.round(1) }
    end

    buckets.transform_values { |entries| entries.sort_by { |e| -e[:hours] } }
  end

  def compute_build_approved_stats
    usr_ids = User.kept.pluck(:id)
    user_data = User.where(id: usr_ids).pluck(:id, :email, :slack_id)
                   .to_h { |id, email, slack_id| [ id, { email: email, slack_id: slack_id } ] }

    approved_by_user = Ship
      .joins(:project)
      .where(status: :approved, projects: { user_id: usr_ids, discarded_at: nil })
      .left_joins(:design_review, :build_review)
      .group("projects.user_id")
      .sum(Arel.sql("COALESCE(ships.approved_seconds, 0) + COALESCE(design_reviews.hours_adjustment, 0) + COALESCE(build_reviews.hours_adjustment, 0)"))

    buckets = BUCKETS.transform_values { [] }

    usr_ids.each do |uid|
      total = approved_by_user[uid].to_i
      next if total < 3600

      h = total / 3600.0
      buckets[bucket_for(h)] << { email: user_data[uid][:email], slack_id: user_data[uid][:slack_id], hours: h.round(1) }
    end

    buckets.transform_values { |entries| entries.sort_by { |e| -e[:hours] } }
  end
end
