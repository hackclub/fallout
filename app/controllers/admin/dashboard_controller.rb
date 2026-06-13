class Admin::DashboardController < Admin::ApplicationController
  before_action :require_admin!, except: %i[index dev] # Requirements↔Design + TA stats dashboards expose cross-reviewer performance data — admin-only
  skip_after_action :verify_authorized, only: %i[index requirements_design ta_stats dev] # No authorizable resource; staff access enforced by Admin::ApplicationController
  skip_after_action :verify_policy_scoped, only: %i[index requirements_design ta_stats dev] # No scoped collection
  def index
    # Lambdas so these only run for the initial page render — Inertia partial
    # reloads (e.g. the sidebar's deferred admin_stats) skip lambda evaluation
    # for props they didn't ask for, avoiding ~35 wasted queries on each defer.
    render inertia: "admin/dashboard/index", props: {
      stats: -> { contribution_stats },
      backlog_chart: -> { backlog_by_day },
      backlog_hours_chart: -> { backlog_hours_by_day },
      recent_activity: -> { recent_24h_activity }
    }
  end

  def requirements_design
    render inertia: "admin/dashboard/requirements_design", props: {
      leaderboard: -> { requirements_to_design_return_leaderboard },
      totals: -> { requirements_to_design_return_totals },
      reviewer_profiles: -> { requirements_check_reviewer_profiles },
      non_reviewer_channel_members: -> { slack_channel_non_reviewers("C0AGEPQ63DY") },
      contribution_stats: -> { requirements_design_contribution_stats }
    }
  end

  def ta_stats
    render inertia: "admin/dashboard/ta_stats", props: {
      reviewers: -> { reviewer_deflation_stats(ta_review_rows) },
      owners: -> { owner_deflation_stats(ta_review_rows) }
    }
  end

  def dev
    render inertia: "admin/dashboard/dev"
  end

  private

  # Memoized per-request — both ta_stats tables derive from the same per-review rows,
  # so compute the heavy annotation sweep once.
  def ta_review_rows
    @ta_review_rows ||= compute_ta_review_rows
  end

  # One row per approved TA review: raw vs approved recording seconds (annotation math
  # mirrors #time_audited_stats) plus owner/reviewer identity, so callers can aggregate
  # by reviewer or by project owner.
  def compute_ta_review_rows
    reviews = TimeAuditReview
      .where(status: :approved)
      .where.not(reviewer_id: nil)
      .includes(ship: [ { journal_entries: :recordings }, { project: :user } ])

    all_recordings = reviews.flat_map { |ta| ta.ship.journal_entries.reject(&:discarded?).flat_map(&:recordings) }
    recordables_by_type_id = preload_recordables(all_recordings)

    reviewers = User.where(id: reviews.map(&:reviewer_id).uniq).index_by(&:id)

    reviews.filter_map do |ta|
      ship = ta.ship
      project = ship&.project
      next unless project

      rec_annotations = ta.annotations&.dig("recordings") || {}
      raw_total = 0.0
      approved_total = 0.0

      ship.journal_entries.reject(&:discarded?).each do |entry|
        entry.recordings.each do |rec|
          recordable = recordables_by_type_id.dig(rec.recordable_type, rec.recordable_id)
          next unless recordable

          ann = rec_annotations[rec.id.to_s] || {}
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

          raw_total += base
          approved_total += [ approved, 0 ].max
        end
      end

      reviewer = reviewers[ta.reviewer_id]
      {
        ship_id: ship.id,
        project_id: project.id,
        project_name: project.name,
        owner_id: project.user_id,
        owner_display_name: project.user.display_name,
        owner_avatar: project.user.avatar,
        reviewer_id: ta.reviewer_id,
        reviewer_display_name: reviewer&.display_name,
        raw_seconds: raw_total,
        approved_seconds: approved_total,
        # Per-ship deflation = fraction of raw recording time removed/deflated by the TA.
        deflation: raw_total.positive? ? ((raw_total - approved_total) / raw_total) : 0.0,
        reviewed_at: ta.completed_at&.strftime("%b %d, %Y")
      }
    end
  end

  # Table 1 — per reviewer. avg_deflation is the time-weighted overall rate
  # (total removed / total raw), the figure that should converge across reviewers
  # at a large sample. hours_reviewed is the sample size that makes it meaningful.
  def reviewer_deflation_stats(rows)
    rows.group_by { |r| r[:reviewer_id] }.filter_map do |reviewer_id, group|
      name = group.first[:reviewer_display_name]
      next unless name
      raw = group.sum { |r| r[:raw_seconds] }
      approved = group.sum { |r| r[:approved_seconds] }
      {
        id: reviewer_id,
        display_name: name,
        avg_deflation: raw.positive? ? ((raw - approved) / raw) : 0.0,
        hours_reviewed: (approved / 3600.0).round(1),
        ships_reviewed: group.size,
        projects_reviewed: group.map { |r| r[:project_id] }.uniq.size
      }
    end.sort_by { |r| -r[:hours_reviewed] }
  end

  # Table 2 — per project owner with >= 2 audited ships (need multiple ships to
  # compare). Surfaces the spread of per-ship deflation and how many distinct
  # reviewers touched the owner's ships, so a big spread across different reviewers
  # stands out. No "abnormal" cutoff applied — raw spread/min/max/stddev only.
  def owner_deflation_stats(rows)
    rows.group_by { |r| r[:owner_id] }.filter_map do |_owner_id, group|
      next if group.size < 2

      deflations = group.map { |r| r[:deflation] }
      min = deflations.min
      max = deflations.max
      first = group.first
      ships = group.sort_by { |r| -r[:deflation] }.map do |r|
        {
          ship_id: r[:ship_id],
          project_id: r[:project_id],
          project_name: r[:project_name],
          reviewer_id: r[:reviewer_id],
          reviewer_display_name: r[:reviewer_display_name],
          deflation: r[:deflation],
          hours: (r[:approved_seconds] / 3600.0).round(1),
          reviewed_at: r[:reviewed_at]
        }
      end
      {
        id: first[:owner_id],
        display_name: first[:owner_display_name],
        avatar: first[:owner_avatar],
        ship_count: group.size,
        reviewer_count: group.map { |r| r[:reviewer_id] }.uniq.size,
        avg_deflation: deflations.sum / deflations.size,
        min_deflation: min,
        max_deflation: max,
        spread: max - min,
        stddev: stddev(deflations),
        ships: ships
      }
    end.sort_by { |r| -r[:spread] }
  end

  # Population standard deviation; 0 for a single value.
  def stddev(values)
    return 0.0 if values.size < 2
    mean = values.sum / values.size
    Math.sqrt(values.sum { |v| (v - mean)**2 } / values.size)
  end

  # Combines review_count_stats and time_audited_stats into the shape the
  # "Reviews Completed" / "Time Audited" / "Total Contributed" leaderboards expect.
  def contribution_stats
    week_ago = 7.days.ago
    terminal = %w[approved returned rejected]
    completed_ta = TimeAuditReview.where(status: :approved).where.not(approved_public_seconds: nil)

    reviewer_counts = review_count_stats(terminal, week_ago: week_ago)
    time_audited = time_audited_stats(completed_ta, week_ago: week_ago)
    {
      all_time: { reviewers: reviewer_counts[:all_time], time_audited: time_audited[:all_time] },
      this_week: { reviewers: reviewer_counts[:this_week], time_audited: time_audited[:this_week] }
    }
  end

  # contribution_stats, plus zero-value rows for every reviewer-role user with no
  # recorded contributions and italic-flagged rows for RC-channel members who aren't
  # reviewers yet — so "Total Contributed" surfaces everyone who could be contributing.
  # Anyone with excluded_from_dashboard set is moved into `hidden` instead, so admins
  # can excuse people (e.g. on leave) without deleting their contribution history.
  # Once excluded_until passes, the row moves back to visible but flagged with
  # needs_review so an admin can check on them and resolve the exclusion.
  def requirements_design_contribution_stats
    stats = contribution_stats
    reviewers = all_reviewer_users
    non_reviewers = slack_channel_non_reviewers("C0AGEPQ63DY")
    excluded_ids, needs_review_ids = partition_excluded_ids
    reasons = excluded_dashboard_reasons(excluded_ids | needs_review_ids)

    visible_all_time, hidden_all_time =
      split_contribution_period(stats[:all_time], reviewers, non_reviewers, excluded_ids, needs_review_ids, reasons)
    visible_week, hidden_week =
      split_contribution_period(stats[:this_week], reviewers, non_reviewers, excluded_ids, needs_review_ids, reasons)

    {
      all_time: visible_all_time,
      this_week: visible_week,
      hidden: { all_time: hidden_all_time, this_week: hidden_week }
    }
  end

  # Partitions a period's reviewers/time_audited rows (plus the zero-value rows for
  # reviewer-role users and non-reviewer channel members) into visible vs hidden
  # based on excluded_ids, returning [visible_period_stats, hidden_period_stats].
  # Visible rows whose id is in needs_review_ids get flagged + their reason attached.
  def split_contribution_period(period_stats, reviewers, non_reviewers, excluded_ids, needs_review_ids, reasons)
    visible_reviewers, hidden_reviewers = period_stats[:reviewers].partition { |r| !excluded_ids.include?(r[:id]) }
    visible_time, hidden_time = period_stats[:time_audited].partition { |r| !excluded_ids.include?(r[:id]) }

    visible_present = (visible_reviewers.map { |r| r[:id] } + visible_time.map { |r| r[:id] }).to_set
    hidden_present = (hidden_reviewers.map { |r| r[:id] } + hidden_time.map { |r| r[:id] }).to_set

    visible_pool, hidden_pool = reviewers.partition { |u| !excluded_ids.include?(u.id) }
    visible_non_reviewer_pool, hidden_non_reviewer_pool = non_reviewers.partition { |u| !excluded_ids.include?(u[:id]) }

    visible_reviewer_rows = visible_reviewers + zero_contribution_rows(visible_pool, visible_present) +
      zero_contribution_rows(visible_non_reviewer_pool, visible_present, is_reviewer: false)
    hidden_reviewer_rows = hidden_reviewers + zero_contribution_rows(hidden_pool, hidden_present) +
      zero_contribution_rows(hidden_non_reviewer_pool, hidden_present, is_reviewer: false)

    visible = {
      reviewers: visible_reviewer_rows.map { |r| flag_needs_review(r, needs_review_ids, reasons) },
      time_audited: visible_time.map { |r| flag_needs_review(r, needs_review_ids, reasons) }
    }
    hidden = {
      reviewers: hidden_reviewer_rows.map { |r| r.merge(reason: reasons[r[:id]]) },
      time_audited: hidden_time.map { |r| r.merge(reason: reasons[r[:id]]) }
    }

    [ visible, hidden ]
  end

  def flag_needs_review(row, needs_review_ids, reasons)
    return row unless needs_review_ids.include?(row[:id])
    row.merge(needs_review: true, reason: reasons[row[:id]])
  end

  # Builds zero-review_count rows for reviewer-role users (User records) or
  # non-reviewer channel members (hashes) not already present in the period.
  def zero_contribution_rows(entries, present_ids, is_reviewer: nil)
    entries.reject { |e| present_ids.include?(e.is_a?(Hash) ? e[:id] : e.id) }.map do |e|
      id, display_name, avatar = e.is_a?(Hash) ? [ e[:id], e[:display_name], e[:avatar] ] : [ e.id, e.display_name, e.avatar ]
      row = { id: id, display_name: display_name, avatar: avatar, review_count: 0 }
      row[:is_reviewer] = is_reviewer unless is_reviewer.nil?
      row
    end
  end

  # Splits excluded_from_dashboard users into still-excused (excluded_until is blank
  # or in the future) vs expired (excluded_until has passed), returning
  # [excluded_ids, needs_review_ids].
  def partition_excluded_ids
    today = Date.current
    excluded_ids = Set.new
    needs_review_ids = Set.new
    User.where(excluded_from_dashboard: true).pluck(:id, :excluded_until).each do |id, excluded_until|
      if excluded_until && excluded_until < today
        needs_review_ids << id
      else
        excluded_ids << id
      end
    end
    [ excluded_ids, needs_review_ids ]
  end

  # Most recent ReviewerAdminNote body per excluded reviewer, shown alongside their
  # hidden leaderboard row so admins can see why they were excused.
  def excluded_dashboard_reasons(excluded_ids)
    return {} if excluded_ids.empty?
    ReviewerAdminNote.where(reviewer_id: excluded_ids.to_a)
      .order(created_at: :desc)
      .group_by(&:reviewer_id)
      .transform_values { |notes| notes.first.body }
  end

  def all_reviewer_users
    @all_reviewer_users ||= User.where("roles && ARRAY[?]::varchar[]", User::REVIEWER_ROLES).to_a
  end

  # Counts completed reviews per reviewer across all four review types, returning
  # both all_time and this_week buckets. Fires all eight grouped counts in parallel
  # via async so wall-time ≈ one round-trip on a remote DB.
  def review_count_stats(terminal_statuses, week_ago:)
    klasses = [ TimeAuditReview, DesignReview, BuildReview, RequirementsCheckReview ]
    base_scopes = klasses.to_h { |k| [ k, k.where(status: terminal_statuses).where.not(reviewer_id: nil) ] }

    all_promises = base_scopes.transform_values { |s| s.group(:reviewer_id).async_count }
    week_promises = base_scopes.transform_values { |s| s.where.not(completed_at: nil).where(s.klass.arel_table[:completed_at].gteq(week_ago)).group(:reviewer_id).async_count }

    all_time = Hash.new(0)
    week = Hash.new(0)
    all_promises.each_value { |p| p.value.each { |id, n| all_time[id] += n } }
    week_promises.each_value { |p| p.value.each { |id, n| week[id] += n } }

    reviewer_ids = (all_time.keys | week.keys)
    users = User.where(id: reviewer_ids).index_by(&:id)

    build_rows = ->(counts) {
      counts.filter_map do |reviewer_id, count|
        user = users[reviewer_id]
        next unless user
        { id: reviewer_id, display_name: user.display_name, avatar: user.avatar, review_count: count }
      end.sort_by { |r| -r[:review_count] }
    }

    { all_time: build_rows.call(all_time), this_week: build_rows.call(week) }
  end

  # Sums approved seconds per reviewer, attributed per recording annotation.
  # Each recording annotation stores a reviewer_id for who annotated it; hours are
  # split across reviewers based on which recordings they actually worked on rather
  # than crediting all hours to whoever submitted/approved the review.
  # Reviews without per-annotation reviewer_id (old data) fall back to the review-level reviewer_id.
  # Loads the all_time set once and buckets each contribution into all_time and (if
  # the review updated within week_ago) this_week, avoiding a duplicate full sweep.
  def time_audited_stats(scope, week_ago:)
    reviews = scope
      .where.not(reviewer_id: nil)
      .includes(ship: { journal_entries: :recordings })

    # Preload all recordables in bulk (3 queries total) to avoid N+1 from
    # polymorphic :recordable eager loading, which fires per-type-per-batch.
    # Filter kept entries in Ruby against the already-eager-loaded collection — calling
    # `.kept` on the association would re-issue queries and bypass `includes` above.
    all_recordings = reviews.flat_map { |ta| ta.ship.journal_entries.reject(&:discarded?).flat_map(&:recordings) }
    recordables_by_type_id = preload_recordables(all_recordings)

    all_time = Hash.new(0)
    week = Hash.new(0)

    reviews.each do |ta|
      rec_annotations = ta.annotations&.dig("recordings") || {}
      fallback_reviewer_id = ta.reviewer_id
      in_week = ta.completed_at.present? && ta.completed_at >= week_ago

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

          contribution = [ approved, 0 ].max
          all_time[reviewer_id] += contribution
          week[reviewer_id] += contribution if in_week
        end
      end
    end

    reviewer_ids = (all_time.keys | week.keys)
    users = User.where(id: reviewer_ids).index_by(&:id)

    build_rows = ->(by_reviewer) {
      by_reviewer.filter_map do |reviewer_id, total|
        user = users[reviewer_id]
        next unless user
        { id: reviewer_id, display_name: user.display_name, avatar: user.avatar, total_approved_seconds: total.round }
      end.sort_by { |r| -r[:total_approved_seconds] }
    }

    { all_time: build_rows.call(all_time), this_week: build_rows.call(week) }
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

  # For each day since launch, computes:
  #   hours  — recording hours in ships not yet TA-approved (i.e. hours backlog)
  #   total  — ship_backlog + hours_backlog / TA_HOURS_PER_REVIEW_EQUIVALENT
  #             (converts hours to review-effort units and adds to ship count)
  def backlog_hours_by_day
    start_date = Date.new(2026, 4, 7)
    end_date   = Date.today
    ta_equiv   = Admin::ReviewersController::TA_HOURS_PER_REVIEW_EQUIVALENT.to_f
    terminal   = %w[approved returned rejected]

    # Single query: recording durations per ship creation date (all history)
    submitted_by_day = ActiveRecord::Base.connection.execute(<<~SQL.squish).to_a
      SELECT ships.created_at::date AS day,
             COALESCE(SUM(
               CASE recordings.recordable_type
                 WHEN 'LapseTimelapse'   THEN lt.duration
                 WHEN 'LookoutTimelapse' THEN lot.duration
                 WHEN 'YouTubeVideo'     THEN ytv.duration_seconds::float * ytv.stretch_multiplier
                 ELSE 0
               END
             ), 0) AS seconds
      FROM recordings
      INNER JOIN journal_entries
        ON journal_entries.id = recordings.journal_entry_id
        AND journal_entries.discarded_at IS NULL
        AND journal_entries.ship_id IS NOT NULL
      INNER JOIN ships ON ships.id = journal_entries.ship_id
      LEFT JOIN lapse_timelapses lt
        ON lt.id = recordings.recordable_id AND recordings.recordable_type = 'LapseTimelapse'
      LEFT JOIN lookout_timelapses lot
        ON lot.id = recordings.recordable_id AND recordings.recordable_type = 'LookoutTimelapse'
      LEFT JOIN you_tube_videos ytv
        ON ytv.id = recordings.recordable_id AND recordings.recordable_type = 'YouTubeVideo'
      GROUP BY ships.created_at::date
      ORDER BY ships.created_at::date
    SQL
    submitted_by_day = submitted_by_day.to_h { |r| [ Date.parse(r["day"].to_s), r["seconds"].to_f ] }

    # TA-approved seconds per completion date, excluding each project's one-time
    # manual_seconds bonus (added to approved_public_seconds on the project's first
    # approved ship — see TimeAuditReview#add_manual_seconds_to_approved). Those seconds
    # don't come from a Recording, so they have no entry in submitted_by_day and would
    # otherwise inflate cum_approved_s past cum_submitted_s.
    approved_by_day = ActiveRecord::Base.connection.execute(<<~SQL.squish).to_a
      WITH first_approved_ships AS (
        SELECT id, project_id,
               ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at, id) AS rn
        FROM ships
        WHERE status = #{Ship.statuses[:approved]}
      )
      SELECT tar.completed_at::date AS day,
             SUM(
               tar.approved_public_seconds -
               CASE WHEN fas.rn = 1 THEN p.manual_seconds ELSE 0 END
             ) AS seconds
      FROM time_audit_reviews tar
      INNER JOIN ships s ON s.id = tar.ship_id
      INNER JOIN projects p ON p.id = s.project_id
      LEFT JOIN first_approved_ships fas ON fas.id = s.id
      WHERE tar.status = #{TimeAuditReview.statuses[:approved]}
        AND tar.completed_at IS NOT NULL
        AND tar.approved_public_seconds IS NOT NULL
      GROUP BY tar.completed_at::date
      ORDER BY tar.completed_at::date
    SQL
    approved_by_day = approved_by_day.to_h { |r| [ Date.parse(r["day"].to_s), r["seconds"].to_f ] }

    # Ship count data (same structure as backlog_by_day)
    ships_by_day = Ship.where("created_at < ?", end_date.end_of_day)
      .group("created_at::date").count
      .filter_map { |k, v| [ Date.parse(k.to_s), v ] if k.present? }
      .to_h
    ta_by_day = TimeAuditReview.where(status: terminal).where("updated_at < ?", end_date.end_of_day)
      .group("updated_at::date").count
      .filter_map { |k, v| [ Date.parse(k.to_s), v ] if k.present? }
      .to_h

    # Pre-start cumulative totals
    cum_submitted_s = submitted_by_day.sum { |d, s| d < start_date ? s : 0 }
    cum_approved_s  = approved_by_day.sum  { |d, s| d < start_date ? s : 0 }
    cum_ships       = Ship.where("created_at < ?", start_date).count
    cum_ta          = TimeAuditReview.where(status: terminal).where("updated_at < ?", start_date).count

    (start_date..end_date).map do |date|
      cum_submitted_s += submitted_by_day[date].to_f
      cum_approved_s  += approved_by_day[date].to_f
      cum_ships       += ships_by_day[date].to_i
      cum_ta          += ta_by_day[date].to_i

      hours_backlog = [ (cum_submitted_s - cum_approved_s) / 3600.0, 0 ].max.round(1)
      ship_backlog  = [ cum_ships - cum_ta, 0 ].max
      total         = (ship_backlog + hours_backlog / ta_equiv).round(2)

      { date: date.iso8601, hours: hours_backlog, total: total }
    end
  end

  def requirements_check_reviewer_profiles
    # All users who can review requirements checks, including those with zero reviews
    reviewers = User.where("roles && ARRAY['requirements_checker', 'pass2_reviewer']::varchar[]")

    terminal = %w[approved returned rejected]
    # COALESCE ensures reviews without completed_at (pre-column or update_columns) still appear
    week_expr = Arel.sql("TO_CHAR(DATE_TRUNC('week', COALESCE(completed_at, updated_at)), 'YYYY-MM-DD')")

    rc_rows = RequirementsCheckReview
      .where(status: terminal).where.not(reviewer_id: nil)
      .group(:reviewer_id).group(week_expr).count

    dr_rows = DesignReview
      .where(status: terminal).where.not(reviewer_id: nil)
      .group(:reviewer_id).group(week_expr).count

    br_rows = BuildReview
      .where(status: terminal).where.not(reviewer_id: nil)
      .group(:reviewer_id).group(week_expr).count

    ta_rows = TimeAuditReview
      .where(status: :approved).where.not(reviewer_id: nil)
      .group(:reviewer_id).group(week_expr).sum(:approved_public_seconds)

    rc_by = Hash.new { |h, k| h[k] = Hash.new(0) }
    dr_by = Hash.new { |h, k| h[k] = Hash.new(0) }
    br_by = Hash.new { |h, k| h[k] = Hash.new(0) }
    ta_by = Hash.new { |h, k| h[k] = Hash.new(0) }
    rc_rows.each { |(rid, w), n| rc_by[rid][w] = n }
    dr_rows.each { |(rid, w), n| dr_by[rid][w] = n }
    br_rows.each { |(rid, w), n| br_by[rid][w] = n }
    ta_rows.each { |(rid, w), s| ta_by[rid][w] = s }

    # All-time totals across all review types — matches the main dashboard leaderboard
    all_time_by_reviewer = Hash.new(0)
    [ TimeAuditReview, DesignReview, BuildReview, RequirementsCheckReview ].each do |klass|
      klass.where(status: terminal).where.not(reviewer_id: nil).group(:reviewer_id).count
        .each { |reviewer_id, count| all_time_by_reviewer[reviewer_id] += count }
    end

    # All-time RC counts per reviewer (not date-filtered)
    rc_all_time = RequirementsCheckReview
      .where(status: terminal).where.not(reviewer_id: nil)
      .group(:reviewer_id).count

    # Derive the weeks range from actual data so no reviews are silently dropped
    all_week_keys = (rc_rows.keys.map(&:last) + dr_rows.keys.map(&:last) + br_rows.keys.map(&:last) + ta_rows.keys.map(&:last)).uniq.sort
    today_week = Date.today.beginning_of_week(:monday)
    start_week = all_week_keys.any? ? Date.parse(all_week_keys.first).beginning_of_week(:monday) : today_week

    weeks = []
    w = start_week
    while w <= today_week
      weeks << w.iso8601
      w += 7
    end

    resolutions_by_reviewer = ReviewerWeekResolution.where(reviewer_id: reviewers.map(&:id))
      .group_by(&:reviewer_id)
      .transform_values { |rs| rs.index_by { |r| r.week_start.iso8601 } }

    reviewers.map do |user|
      weekly = weeks.map do |week|
        rc = rc_by[user.id][week]
        dr = dr_by[user.id][week]
        br = br_by[user.id][week]
        ta_hours = (ta_by[user.id][week].to_f / 3600).round(1)
        ta = (ta_by[user.id][week].to_f / (Admin::ReviewersController::TA_HOURS_PER_REVIEW_EQUIVALENT * 3600)).round(2)
        total = rc + dr + br + ta
        resolved = resolutions_by_reviewer.dig(user.id, week).present?
        { week: week, rc: rc, dr: dr, br: br, ta: ta, ta_hours: ta_hours, low: total > 0 && total < 15, resolved: resolved }
      end
      {
        id: user.id,
        display_name: user.display_name,
        avatar: user.avatar,
        total_reviews: all_time_by_reviewer[user.id],
        rc_reviews: rc_all_time[user.id].to_i,
        reviews_by_week: weekly
      }
    end.sort_by { |r| -r[:total_reviews] }
  end

  # Fetches members of the RC reviewer Slack channel and returns those who have a
  # Fallout account but haven't been granted requirements_checker or pass2_reviewer yet.
  # In development without a bot token, falls back to all non-reviewer users with a slack_id
  # so seed data is visible without needing a real Slack connection.
  # Memoized per-request — both non_reviewer_channel_members and contribution_stats
  # need this list, and it can make a Slack API call.
  def slack_channel_non_reviewers(channel_id)
    @slack_channel_non_reviewers ||= {}
    @slack_channel_non_reviewers[channel_id] ||= begin
      reviewer_roles = %w[requirements_checker pass2_reviewer time_auditor admin]

      if Rails.env.development? && ENV["SLACK_BOT_TOKEN"].blank?
        User
          .where.not(slack_id: [ nil, "" ])
          .where.not("roles && ARRAY[?]::varchar[]", reviewer_roles)
          .where(excluded_from_reviewer_suggestions: false)
          .map { |u| { id: u.id, display_name: u.display_name, avatar: u.avatar } }
          .sort_by { |u| u[:display_name] }
      else
        client = Slack::Web::Client.new(token: ENV.fetch("SLACK_BOT_TOKEN", nil))

        member_slack_ids = []
        cursor = nil
        loop do
          response = client.conversations_members(channel: channel_id, limit: 1000, cursor: cursor)
          member_slack_ids.concat(response.members)
          cursor = response.response_metadata&.next_cursor
          break if cursor.blank?
        end

        User
          .where(slack_id: member_slack_ids)
          .where.not("roles && ARRAY[?]::varchar[]", reviewer_roles)
          .where(excluded_from_reviewer_suggestions: false)
          .map { |u| { id: u.id, display_name: u.display_name, avatar: u.avatar } }
          .sort_by { |u| u[:display_name] }
      end
    end
  rescue => e
    Rails.logger.error("slack_channel_non_reviewers failed: #{e.message}")
    []
  end

  def requirements_to_design_return_scope
    RequirementsCheckReview
      .approved
      .where.not(reviewer_id: nil)
      .joins(ship: :project)
      .joins("LEFT JOIN design_reviews ON design_reviews.ship_id = ships.id")
  end

  def requirements_to_design_return_leaderboard
    returned_project_count_sql = ActiveRecord::Base.sanitize_sql_array([
      "COUNT(DISTINCT CASE WHEN design_reviews.status = ? THEN projects.id END)",
      DesignReview.statuses[:returned]
    ])

    rows = requirements_to_design_return_scope
      .group("requirements_check_reviews.reviewer_id")
      .pluck(
        "requirements_check_reviews.reviewer_id",
        Arel.sql("COUNT(DISTINCT projects.id)"),
        Arel.sql(returned_project_count_sql)
      )

    # Fetch the individual projects behind each reviewer's "Returned DR" count
    returned_project_rows = requirements_to_design_return_scope
      .where("design_reviews.status = ?", DesignReview.statuses[:returned])
      .select("requirements_check_reviews.reviewer_id, projects.id AS project_id, projects.name AS project_name")
      .distinct
      .map { |r| [ r.reviewer_id, { id: r.project_id, name: r.project_name } ] }

    returned_projects_by_reviewer = returned_project_rows.group_by(&:first).transform_values { |pairs| pairs.map(&:last) }

    users = User.where(id: rows.map(&:first)).index_by(&:id)

    leaderboard_rows = rows.filter_map do |reviewer_id, approved_projects, returned_projects|
      user = users[reviewer_id]
      next unless user

      approved_projects = approved_projects.to_i
      returned_projects = returned_projects.to_i
      return_rate = approved_projects.positive? ? (returned_projects.to_f / approved_projects) : 0.0

      {
        id: reviewer_id,
        display_name: user.display_name,
        avatar: user.avatar,
        approved_projects: approved_projects,
        design_returned_projects: returned_projects,
        return_rate: return_rate,
        returned_dr_projects: returned_projects_by_reviewer[reviewer_id] || []
      }
    end

    # Surface every reviewer-role user, even with zero approved RC reviews
    present_ids = leaderboard_rows.map { |r| r[:id] }.to_set
    missing_rows = all_reviewer_users.reject { |u| present_ids.include?(u.id) }.map do |u|
      {
        id: u.id,
        display_name: u.display_name,
        avatar: u.avatar,
        approved_projects: 0,
        design_returned_projects: 0,
        return_rate: 0.0,
        returned_dr_projects: []
      }
    end

    (leaderboard_rows + missing_rows).sort_by { |row| [ -row[:return_rate], -row[:design_returned_projects], -row[:approved_projects] ] }
  end

  def requirements_to_design_return_totals
    scope = requirements_to_design_return_scope
    approved_projects = scope.distinct.count("projects.id")
    returned_projects = scope.where("design_reviews.status = ?", DesignReview.statuses[:returned]).distinct.count("projects.id")

    {
      approved_projects: approved_projects,
      design_returned_projects: returned_projects,
      return_rate: approved_projects.positive? ? (returned_projects.to_f / approved_projects) : 0.0
    }
  end
end
