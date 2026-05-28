class Admin::ReviewersController < Admin::ApplicationController
  skip_after_action :verify_authorized   # No index action; authorize called explicitly below
  skip_after_action :verify_policy_scoped # No index action

  TA_HOURS_PER_REVIEW_EQUIVALENT = 5.5

  def show
    @reviewer = User.find(params[:id])
    authorize @reviewer, :show?, policy_class: UserPolicy

    start_week = Date.new(2026, 1, 5) # First Monday of 2026 — earliest reviewer onboarding
    today_week = Date.today.beginning_of_week(:monday)
    weeks = []
    w = start_week
    while w <= today_week
      weeks << w.iso8601
      w += 7
    end

    week_group = Arel.sql("TO_CHAR(DATE_TRUNC('week', updated_at), 'YYYY-MM-DD')")
    terminal = %w[approved returned rejected]

    rc_rows = RequirementsCheckReview
      .where(status: terminal, reviewer_id: @reviewer.id)
      .where("updated_at >= ?", start_week)
      .group(week_group).count

    dr_rows = DesignReview
      .where(status: terminal, reviewer_id: @reviewer.id)
      .where("updated_at >= ?", start_week)
      .group(week_group).count

    ta_rows = TimeAuditReview
      .where(status: :approved, reviewer_id: @reviewer.id)
      .where("updated_at >= ?", start_week)
      .group(week_group).sum(:approved_public_seconds)

    all_time_reviews = [ TimeAuditReview, DesignReview, BuildReview, RequirementsCheckReview ]
      .sum { |klass| klass.where(status: terminal, reviewer_id: @reviewer.id).count }

    resolutions = @reviewer.reviewer_week_resolutions.index_by { |r| r.week_start.iso8601 }

    reviews_by_week = weeks.map do |week|
      rc = rc_rows[week].to_i
      dr = dr_rows[week].to_i
      ta_hours = (ta_rows[week].to_f / 3600).round(1)
      ta = (ta_rows[week].to_f / (TA_HOURS_PER_REVIEW_EQUIVALENT * 3600)).round(2)
      resolution = resolutions[week]
      {
        week: week,
        rc: rc,
        dr: dr,
        ta: ta,
        ta_hours: ta_hours,
        low: (rc + dr + ta) > 0 && (rc + dr + ta) < 15,
        resolved: resolution.present?,
        resolution_id: resolution&.id,
        resolution_reason: resolution&.reason
      }
    end

    low_weeks = reviews_by_week.count { |w| w[:low] && !w[:resolved] }

    render inertia: "admin/reviewers/show", props: {
      reviewer: {
        id: @reviewer.id,
        display_name: @reviewer.display_name,
        avatar: @reviewer.avatar,
        roles: @reviewer.roles,
        total_reviews: all_time_reviews,
        rc_reviews: rc_rows.values.sum,
        reviews_by_week: reviews_by_week,
        low_week_count: low_weeks
      },
      notes: @reviewer.reviewer_admin_notes.order(created_at: :desc).map { |n|
        { id: n.id, body: n.body, author_name: n.author.display_name, created_at: n.created_at.strftime("%b %d, %Y") }
      },
      unavailabilities: @reviewer.reviewer_unavailabilities.order(starts_on: :asc).map { |u|
        { id: u.id, starts_on: u.starts_on.iso8601, ends_on: u.ends_on.iso8601, reason: u.reason }
      },
      can_manage: current_user.admin?
    }
  end
end
