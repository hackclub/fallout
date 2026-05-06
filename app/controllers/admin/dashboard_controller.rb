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
      recent_activity: recent_24h_activity
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

  # Sums approved seconds per reviewer, attributed per recording annotation.
  # Each recording annotation stores a reviewer_id for who annotated it; hours are
  # split across reviewers based on which recordings they actually worked on rather
  # than crediting all hours to whoever submitted/approved the review.
  # Reviews without per-annotation reviewer_id (old data) fall back to the review-level reviewer_id.
  def time_audited_stats(scope)
    reviews = scope
      .where.not(reviewer_id: nil)
      .includes(ship: { journal_entries: :recordings })

    # Preload all recordables in bulk (3 queries total) to avoid N+1 from
    # polymorphic :recordable eager loading, which fires per-type-per-batch.
    # Filter kept entries in Ruby against the already-eager-loaded collection — calling
    # `.kept` on the association would re-issue queries and bypass `includes` above.
    all_recordings = reviews.flat_map { |ta| ta.ship.journal_entries.reject(&:discarded?).flat_map(&:recordings) }
    recordables_by_type_id = preload_recordables(all_recordings)

    seconds_by_reviewer = Hash.new(0)

    reviews.each do |ta|
      rec_annotations = ta.annotations&.dig("recordings") || {}
      fallback_reviewer_id = ta.reviewer_id

      ta.ship.journal_entries.reject(&:discarded?).each do |entry|
        entry.recordings.each do |rec|
          recordable = recordables_by_type_id.dig(rec.recordable_type, rec.recordable_id)
          next unless recordable

          ann = rec_annotations[rec.id.to_s] || {}
          reviewer_id = ann["reviewer_id"]&.to_i || fallback_reviewer_id

          multiplier = recordable.is_a?(YouTubeVideo) ? (ann["stretch_multiplier"]&.to_f || 1.0) : 60.0
          raw = case recordable
                when LookoutTimelapse, LapseTimelapse then recordable.duration.to_i
                when YouTubeVideo then recordable.duration_seconds.to_i
                else 0
                end
          base = recordable.is_a?(YouTubeVideo) ? raw * multiplier : raw

          approved = base
          (ann["segments"] || []).each do |seg|
            range = (seg["end_seconds"].to_f - seg["start_seconds"].to_f) * multiplier
            case seg["type"]
            when "removed"  then approved -= range
            when "deflated" then approved -= range * (seg["deflated_percent"].to_f / 100)
            end
          end

          seconds_by_reviewer[reviewer_id] += [ approved, 0 ].max
        end
      end
    end

    reviewer_ids = seconds_by_reviewer.keys
    users = User.where(id: reviewer_ids).index_by(&:id)

    rows = seconds_by_reviewer.filter_map do |reviewer_id, total|
      user = users[reviewer_id]
      next unless user
      { id: reviewer_id, display_name: user.display_name, avatar: user.avatar, total_approved_seconds: total.round }
    end.sort_by { |r| -r[:total_approved_seconds] }

    { time_audited: rows }
  end

  # Preloads all three recordable types in 3 queries and returns a nested hash
  # { type_name => { id => record } } for O(1) lookup during iteration.
  def preload_recordables(recordings)
    by_type = recordings.group_by(&:recordable_type)
    {
      "LookoutTimelapse" => LookoutTimelapse.where(id: by_type["LookoutTimelapse"]&.map(&:recordable_id)).index_by(&:id),
      "LapseTimelapse"   => LapseTimelapse.where(id: by_type["LapseTimelapse"]&.map(&:recordable_id)).index_by(&:id),
      "YouTubeVideo"     => YouTubeVideo.where(id: by_type["YouTubeVideo"]&.map(&:recordable_id)).index_by(&:id)
    }
  end

  private

  # Count and average turnaround for requirements check reviews completed in the past 24 hours.
  # Turnaround = time from ship submission (ship.created_at) to review completion (updated_at).
  def recent_24h_activity
    since = 24.hours.ago
    completed = RequirementsCheckReview
      .where(status: %w[approved returned rejected])
      .where("requirements_check_reviews.updated_at >= ?", since)
      .joins(:ship)
      .pluck("requirements_check_reviews.updated_at", "ships.created_at")

    count = completed.size
    avg_seconds = if count > 0
      total = completed.sum { |reviewed_at, ship_created_at| (reviewed_at - ship_created_at).to_i }
      (total.to_f / count).round
    end

    { count: count, avg_turnaround_seconds: avg_seconds }
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
end
