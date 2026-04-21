class Admin::OtherStatsController < Admin::ApplicationController
  skip_after_action :verify_authorized # No authorizable resource; staff access enforced by Admin::ApplicationController
  skip_after_action :verify_policy_scoped # No scoped collection

  def index
    render inertia: "admin/other_stats/index", props: {
      review_intervals: review_interval_stats
    }
  end

  private

  THIRTY_MINUTES = 30.minutes.to_i

  def review_interval_stats
    terminal = %w[approved returned rejected]

    all_reviews = []
    [DesignReview, BuildReview, RequirementsCheckReview].each do |klass|
      all_reviews += klass
        .where(status: terminal)
        .where.not(reviewer_id: nil)
        .pluck(:reviewer_id, :updated_at)
    end

    grouped = all_reviews.group_by(&:first)

    reviewer_ids = grouped.keys
    reviewers = User.where(id: reviewer_ids).index_by(&:id)

    grouped.filter_map do |reviewer_id, entries|
      timestamps = entries.map(&:last).sort

      intervals = []
      timestamps.each_cons(2) do |prev_ts, curr_ts|
        next if prev_ts.to_date != curr_ts.to_date # skip first review of a new day

        gap = (curr_ts - prev_ts).to_i
        next if gap > THIRTY_MINUTES

        intervals << gap
      end

      next if intervals.empty?

      user = reviewers[reviewer_id]
      next unless user

      avg = intervals.sum / intervals.size

      {
        reviewer_id: reviewer_id,
        display_name: user.display_name,
        avatar: user.avatar,
        avg_interval_seconds: avg,
        sample_count: intervals.size
      }
    end.sort_by { |r| r[:avg_interval_seconds] }
  end
end
