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
      backlog_chart: backlog_by_day,
      unaudited_hours_chart: unaudited_hours_by_day
    }
  end

  private

  # Counts completed reviews across all three review types per reviewer
  def review_count_stats(terminal_statuses, since:)
    counts = Hash.new(0)

    [ TimeAuditReview, DesignReview, BuildReview, RequirementsCheckReview ].each do |klass|
      scope = klass.where(status: terminal_statuses).where.not(reviewer_id: nil)
      # Use Arel to reference each class's own table instead of interpolating a
      # table-name string. Brakeman flagged the prior `"#{table}.updated_at"`
      # form even though `table` came from a fixed allowlist; the Arel form is
      # the idiomatic fix and keeps the qualified column to disambiguate
      # `updated_at` (important when a future join is added).
      scope = scope.where(klass.arel_table[:updated_at].gteq(since)) if since
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

  def unaudited_hours_by_day
    start_date = Date.new(2026, 4, 7)
    end_date = Date.today

    terminal_statuses = %w[approved returned rejected]

    raw_duration_sql = <<~SQL.squish
      CASE recordings.recordable_type
        WHEN 'LapseTimelapse'   THEN (SELECT duration FROM lapse_timelapses WHERE id = recordings.recordable_id)
        WHEN 'LookoutTimelapse' THEN (SELECT duration FROM lookout_timelapses WHERE id = recordings.recordable_id)
        WHEN 'YouTubeVideo'     THEN (SELECT duration_seconds * stretch_multiplier FROM you_tube_videos WHERE id = recordings.recordable_id)
        ELSE 0
      END
    SQL

    # Raw recording seconds attributed to ship creation date
    hours_added_by_day = Ship
      .joins(journal_entries: :recordings)
      .where("ships.created_at < ?", end_date.end_of_day)
      .group("ships.created_at::date")
      .sum(Arel.sql(raw_duration_sql))

    # Audited seconds removed on the date TA review reached terminal status
    hours_removed_by_day = TimeAuditReview
      .where(status: terminal_statuses)
      .where.not(approved_seconds: nil)
      .where("time_audit_reviews.updated_at < ?", end_date.end_of_day)
      .group("time_audit_reviews.updated_at::date")
      .sum("time_audit_reviews.approved_seconds")

    cumulative_added = Ship
      .joins(journal_entries: :recordings)
      .where("ships.created_at < ?", start_date)
      .sum(Arel.sql(raw_duration_sql))

    cumulative_removed = TimeAuditReview
      .where(status: terminal_statuses)
      .where.not(approved_seconds: nil)
      .where("time_audit_reviews.updated_at < ?", start_date)
      .sum("time_audit_reviews.approved_seconds")

    (start_date..end_date).map do |date|
      cumulative_added += hours_added_by_day[date].to_i
      cumulative_removed += hours_removed_by_day[date].to_i
      { date: date.iso8601, hours: [ (cumulative_added - cumulative_removed) / 3600.0, 0 ].max.round(1) }
    end
  end

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
