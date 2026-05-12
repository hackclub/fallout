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
    usr_ids = User.kept.verified.pluck(:id)
    all_project_ids = all_member_project_ids(usr_ids)
    return BUCKETS.transform_values { [] } if all_project_ids.empty?

    build_user_buckets(all_project_ids, Project.batch_time_logged(all_project_ids), usr_ids)
  end

  def compute_build_approved_stats
    usr_ids = User.kept.verified.pluck(:id)
    all_project_ids = all_member_project_ids(usr_ids)
    return BUCKETS.transform_values { [] } if all_project_ids.empty?

    approved_by_project = Ship
      .joins(:project)
      .where(status: :approved, projects: { id: all_project_ids, discarded_at: nil })
      .left_joins(:design_review, :build_review)
      .group("projects.id")
      .sum(Arel.sql("COALESCE(ships.approved_public_seconds, 0) + COALESCE(design_reviews.hours_adjustment, 0) + COALESCE(build_reviews.hours_adjustment, 0)"))

    build_user_buckets(all_project_ids, approved_by_project, usr_ids)
  end

  def all_member_project_ids(usr_ids)
    owned = Project.kept.where(user_id: usr_ids).pluck(:id)
    collab = Collaborator.kept
      .where(collaboratable_type: "Project", collaboratable_id: Project.kept.select(:id), user_id: usr_ids)
      .pluck(:collaboratable_id)
    (owned + collab).uniq
  end

  def build_user_buckets(all_project_ids, seconds_by_project, usr_ids)
    owner_by_project = Project.where(id: all_project_ids).pluck(:id, :user_id).to_h
    collabs_by_project = Collaborator.kept
      .where(collaboratable_type: "Project", collaboratable_id: all_project_ids)
      .pluck(:collaboratable_id, :user_id)
      .group_by(&:first)
      .transform_values { |pairs| pairs.map(&:last) }

    kept_set = usr_ids.to_set
    user_seconds = Hash.new(0)
    all_project_ids.each do |pid|
      members = ([ owner_by_project[pid] ] + (collabs_by_project[pid] || [])).uniq.select { |uid| kept_set.include?(uid) }
      next if members.empty?
      total = seconds_by_project[pid].to_i
      base = total / members.size
      remainder = total % members.size
      recipient = kept_set.include?(owner_by_project[pid]) ? owner_by_project[pid] : members.first
      members.each { |uid| user_seconds[uid] += uid == recipient ? base + remainder : base }
    end

    user_data = User.where(id: usr_ids).pluck(:id, :email, :slack_id)
                   .to_h { |id, email, slack_id| [ id, { email: email, slack_id: slack_id } ] }

    buckets = BUCKETS.transform_values { [] }
    usr_ids.each do |uid|
      next if user_seconds[uid] < 3600
      h = user_seconds[uid] / 3600.0
      buckets[bucket_for(h)] << { email: user_data.dig(uid, :email), slack_id: user_data.dig(uid, :slack_id), hours: h.round(2) }
    end
    buckets.transform_values { |entries| entries.sort_by { |e| -e[:hours] } }
  end
end
