class Admin::DashboardController < Admin::ApplicationController
  skip_after_action :verify_authorized, only: %i[index] # No authorizable resource; staff access enforced by Admin::ApplicationController
  skip_after_action :verify_policy_scoped, only: %i[index] # No scoped collection

  def index
    week_ago = 7.days.ago
    completed = TimeAuditReview.where(status: :approved).where.not(approved_seconds: nil)
    completed_this_week = completed.where("time_audit_reviews.updated_at >= ?", week_ago)

    render inertia: "admin/dashboard/index", props: {
      stats: {
        all_time: reviewer_stats(completed),
        this_week: reviewer_stats(completed_this_week)
      }
    }
  end

  private

  def reviewer_stats(scope)
    rows = scope
      .joins("INNER JOIN users ON users.id = time_audit_reviews.reviewer_id")
      .group("users.id", "users.display_name", "users.avatar")
      .select(
        "users.id",
        "users.display_name",
        "users.avatar",
        "COUNT(*) AS review_count",
        "SUM(time_audit_reviews.approved_seconds) AS total_approved_seconds",
        "PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY time_audit_reviews.approved_seconds) AS median_seconds_per_review"
      )
      .order("review_count DESC")
      .map do |r|
        {
          id: r.id,
          display_name: r.display_name,
          avatar: r.avatar,
          review_count: r.review_count,
          total_approved_seconds: r.total_approved_seconds.to_i,
          median_seconds_per_review: r.median_seconds_per_review.to_i
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
