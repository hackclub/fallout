class Admin::DashboardController < Admin::ApplicationController
  skip_after_action :verify_authorized, only: %i[index] # No authorizable resource; staff access enforced by Admin::ApplicationController
  skip_after_action :verify_policy_scoped, only: %i[index] # No scoped collection

  def index
    week_ago = 7.days.ago
    terminal = %w[approved returned rejected]

    completed_ta = TimeAuditReview.where(status: :approved).where.not(approved_seconds: nil)
    completed_ta_week = completed_ta.where("time_audit_reviews.updated_at >= ?", week_ago)

    render inertia: "admin/dashboard/index", props: {
      stats: {
        all_time: {
          reviewers: review_count_stats(terminal, since: nil),
          **time_audited_stats(completed_ta)
        },
        this_week: {
          reviewers: review_count_stats(terminal, since: week_ago),
          **time_audited_stats(completed_ta_week)
        }
      },
      backlog_chart: backlog_by_day
    }
  end

  private

  # Counts completed reviews across all three review types per reviewer
  def review_count_stats(terminal_statuses, since:)
    counts = Hash.new(0)

    [
      [TimeAuditReview, "time_audit_reviews"],
      [DesignReview, "design_reviews"],
      [BuildReview, "build_reviews"],
      [RequirementsCheckReview, "requirements_check_reviews"]
    ].each do |klass, table|
      scope = klass.where(status: terminal_statuses).where.not(reviewer_id: nil)
      scope = scope.where("#{table}.updated_at >= ?", since) if since
      scope.group(:reviewer_id).count.each { |id, n| counts[id] += n }
    end

    reviewer_ids = counts.keys
    users = User.where(id: reviewer_ids).index_by(&:id)

    counts.filter_map do |reviewer_id, count|
      user = users[reviewer_id]
      next unless user
      { id: reviewer_id, display_name: user.display_name, avatar: user.avatar, review_count: count }
    end.sort_by { |r| -r[:review_count] }
  end

  # Sums approved_seconds per reviewer for time audit reviews only
  def time_audited_stats(scope)
    rows = scope
      .joins("INNER JOIN users ON users.id = time_audit_reviews.reviewer_id")
      .group("users.id", "users.display_name", "users.avatar")
      .select(
        "users.id",
        "users.display_name",
        "users.avatar",
        "SUM(time_audit_reviews.approved_seconds) AS total_approved_seconds"
      )
      .map do |r|
        { id: r.id, display_name: r.display_name, avatar: r.avatar, total_approved_seconds: r.total_approved_seconds.to_i }
      end
      .sort_by { |r| -r[:total_approved_seconds] }

    { time_audited: rows }
  end

  private

  def backlog_by_day
    start_date = Date.new(2026, 4, 7)
    end_date = Date.today

    ships_by_day = Ship.where("created_at < ?", end_date.end_of_day)
      .group("created_at::date")
      .count

    terminal_statuses = %w[approved returned rejected]
    completed_by_day = TimeAuditReview.where(status: terminal_statuses)
      .where("updated_at < ?", end_date.end_of_day)
      .group("updated_at::date")
      .count

    cumulative_ships = Ship.where("created_at < ?", start_date).count
    cumulative_completed = TimeAuditReview.where(status: terminal_statuses)
      .where("updated_at < ?", start_date).count

    (start_date..end_date).map do |date|
      cumulative_ships += ships_by_day[date].to_i
      cumulative_completed += completed_by_day[date].to_i
      { date: date.iso8601, backlog: cumulative_ships - cumulative_completed }
    end
  end

  def reviewer_stats(scope)
    rows = scope
      .joins("INNER JOIN users ON users.id = time_audit_reviews.reviewer_id")
      .group("users.id", "users.display_name", "users.avatar")
      .select(
        "users.id",
        "users.display_name",
        "users.avatar",
        "COUNT(*) AS review_count",
        "SUM(time_audit_reviews.approved_seconds) AS total_approved_seconds"
      )
      .order("review_count DESC")
      .map do |r|
        {
          id: r.id,
          display_name: r.display_name,
          avatar: r.avatar,
          review_count: r.review_count,
          total_approved_seconds: r.total_approved_seconds.to_i
        }
      end

    top = rows.first
    {
      reviewers: rows,
      top_reviewer: top,
      total_reviews: rows.sum { |r| r[:review_count] },
      total_approved_seconds: rows.sum { |r| r[:total_approved_seconds] }
    }
  end
end
