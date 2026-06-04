class Admin::Reviews::BaseController < Admin::ApplicationController
  # No index action on base — override verify_authorized/verify_policy_scoped to avoid ActionNotFound
  skip_after_action :verify_authorized
  skip_after_action :verify_policy_scoped

  before_action :set_review, only: %i[ show update heartbeat ]
  before_action :release_all_review_claims, only: %i[ index ]
  before_action :claim_review!, only: %i[ show ]
  before_action :extend_review_claim!, only: %i[ update ]

  # -- Shared actions (heartbeat + next) --

  def heartbeat
    authorize @review, :heartbeat?

    if @review.claimed_by?(current_user)
      @review.extend_claim!
      render json: { ok: true, expires_at: @review.claim_expires_at.iso8601 }
    else
      render json: { error: "claim_lost" }, status: :conflict
    end
  end

  # GET /admin/reviews/:type/next?skip=1,2,3
  # Finds the next eligible review and redirects to its show page.
  def next
    skip_authorization # Collection action — no record to authorize
    skip_ids = parse_skip_ids
    sort = parse_sort
    review = review_model.next_eligible(current_user, skip_ids:, sort:)

    if review
      redirect_to review_show_path(review, skip: skip_ids.any? ? skip_ids.join(",") : nil)
    else
      redirect_to review_index_path, notice: "No more pending reviews."
    end
  end

  private

  def review_model
    raise NotImplementedError
  end

  def set_review
    @review = review_model.find(params[:id])
  end

  # -- Claim lifecycle --

  def release_all_review_claims
    # update_all returns the affected row count; summing across models tells us whether
    # the user had any active claim without an extra round of SELECTs.
    released = Reviewable::REVIEW_MODELS.sum { |name| name.constantize.release_all_claims!(current_user) }
    flash.now[:notice] = "Review session ended." if released.positive?
  end

  def claim_review!
    # Release any existing claim by this user (one claim at a time across all types).
    # Use the update_all row count as the "had_claim" signal — skips a separate active-claim probe.
    released = Reviewable::REVIEW_MODELS.sum { |name| name.constantize.release_all_claims!(current_user) }
    had_claim = released.positive?

    claimed = review_model.atomic_claim!(@review.id, current_user)

    if claimed
      # Only flash "session started" on fresh entry (no skip param = not mid-session)
      flash[:notice] = "Review session started." if !had_claim && params[:skip].blank?
    elsif current_user.admin?
      nil # Admins can view without claiming (supervisory mode)
    elsif !@review.pending?
      redirect_to review_index_path, notice: "This review has already been #{@review.status}."
    else
      # Claimed by someone else — auto-advance to next available
      skip_ids = parse_skip_ids << @review.id
      redirect_to review_next_path(skip: skip_ids.join(",")),
                  alert: "This review is being reviewed by #{@review.reviewer&.display_name}. Finding next..."
    end
  end

  def extend_review_claim!
    @review.extend_claim! if @review.claimed_by?(current_user)
  end

  # -- Helpers --

  def parse_skip_ids
    (params[:skip] || "").split(",").filter_map { |id| id.to_i if id.present? }
  end

  def parse_sort
    # Persist explicit preference in session so it survives PATCH/redirect cycles
    # where params[:sort] is absent (form submission doesn't re-send query params).
    session[review_sort_session_key] = params[:sort] if params[:sort].in?(%w[hours waiting])
    session[review_sort_session_key] == "hours" ? :hours : :waiting
  end

  def review_sort_session_key
    "review_sort:#{params[:controller]}"
  end

  # Flagged projects are visible in the All table but excluded from the pending queue
  def flagged_ship_ids
    Ship.where(project_id: ProjectFlag.select(:project_id)).select(:id)
  end

  def redirect_to_next_or_index(notice:)
    @review.update_columns(claim_expires_at: nil) # Clear claim expiry but keep reviewer_id as audit trail
    clear_flag_if_admin_override!
    skip_ids = parse_skip_ids << @review.id
    redirect_to review_next_path(skip: skip_ids.join(",")), notice: notice
  end

  # Stamp the submitter as reviewer when finalizing a review. The claim system
  # normally sets reviewer_id, but ExpireStaleReviewClaimsJob can clear it
  # between page load and submit, and the policy permits admins to update
  # without an active claim. Without this, terminal reviews can land with
  # reviewer_id=NULL, losing attribution. Only fills when blank so we preserve
  # the original claimer when one exists.
  def stamp_reviewer_for_terminal!(submitted_status)
    return unless %w[approved returned rejected].include?(submitted_status.to_s)
    @review.reviewer_id ||= current_user.id
  end

  # Admin submitting a decision on a flagged review clears the flag (admin override)
  def clear_flag_if_admin_override!
    return unless current_user.admin?
    project = @review.ship.project
    project.project_flags.destroy_all if project.flagged?
  end

  # -- Route helpers — use url_for with controller/action instead of polymorphic_path,
  # because resource names (time_audits) don't match model names (TimeAuditReview). --

  def review_show_path(review, **opts)
    url_for(controller: params[:controller], action: :show, id: review.id, only_path: true, **opts)
  end

  def review_index_path
    url_for(controller: params[:controller], action: :index, only_path: true)
  end

  def review_next_path(**opts)
    url_for(controller: params[:controller], action: :next, only_path: true, **opts)
  end

  def serialize_previous_reviews(project, current_ship, *review_classes)
    review_classes.flat_map do |review_class|
      review_class
        .joins(:ship)
        .where(ships: { project_id: project.id })
        .where.not(ship_id: current_ship.id)
        .where.not(status: review_class.statuses[:pending])
        .includes(:reviewer)
        .map do |review|
          [ review.updated_at, {
            ship_id: review.ship_id,
            review_type: review_class.name.underscore,
            status: review.status,
            feedback: review.feedback,
            internal_reason: review.internal_reason,
            reviewer_display_name: review.reviewer&.display_name,
            reviewed_at: review.updated_at.strftime("%b %d, %Y")
          } ]
        end
    end.sort_by { |updated_at, _| -updated_at.to_i }.map(&:last)
  end

  def serialize_reviewer_notes(project)
    project.reviewer_notes.includes(:user).order(created_at: :desc).map do |note|
      {
        id: note.id,
        body: note.body,
        ship_id: note.ship_id,
        review_stage: note.review_stage,
        author_display_name: note.user.display_name,
        author_avatar: note.user.avatar,
        author_id: note.user_id,
        created_at: note.created_at.iso8601,
        updated_at: note.updated_at.iso8601
      }
    end
  end

  def precompute_user_lifetime_hours(reviews)
    user_ids = reviews.map { |r| r.ship.project.user_id }.uniq
    return {} if user_ids.empty?
    seconds_by_user = Ship.where.not(approved_public_seconds: nil)
      .joins(:project)
      .where(projects: { user_id: user_ids })
      .group("projects.user_id")
      .sum(:approved_public_seconds)
    seconds_by_user.transform_values { |s| s > 0 ? (s / 3600.0).round(1) : nil }
  end

  def serialize_review_row(review, flagged_project_ids: Set.new, previously_reviewed_project_ids: Set.new, user_lifetime_hours: {})
    ship = review.ship
    sibling = review.is_a?(TimeAuditReview) ? ship.requirements_check_review : ship.time_audit_review
    {
      id: review.id,
      ship_id: ship.id,
      project_name: ship.project.name,
      user_display_name: ship.project.user.display_name,
      status: review.status,
      project_flagged: flagged_project_ids.include?(ship.project_id),
      reviewer_display_name: review.reviewer&.display_name,
      created_at: review.created_at.strftime("%b %d, %Y"),
      waiting_since: ship.created_at.iso8601,
      cycle_started_at: ship.cycle_started_at.iso8601,
      is_claimed: review.claimed?,
      claimed_by_display_name: review.claimed? ? review.reviewer&.display_name : nil,
      sibling_approved: sibling&.approved? || false,
      requirements_check_reviewer_display_name: review.is_a?(DesignReview) ? ship.requirements_check_review&.reviewer&.display_name : nil,
      previously_reviewed_by_me: previously_reviewed_project_ids.include?(ship.project_id),
      approved_public_hours: user_lifetime_hours[ship.project.user_id]
    }
  end

  def precompute_previously_reviewed_project_ids
    rc_ids = RequirementsCheckReview
      .where(reviewer_id: current_user.id, status: %i[approved returned rejected])
      .joins(:ship)
      .distinct
      .pluck("ships.project_id")
    dr_ids = DesignReview
      .where(reviewer_id: current_user.id, status: %i[approved returned rejected])
      .joins(:ship)
      .distinct
      .pluck("ships.project_id")
    (rc_ids + dr_ids).to_set
  end

  def serialize_project_context(project, ship)
    logged = (project.time_logged / 3600.0).round(1)
    # ship.approved_public_seconds is only mirrored from the TA when the ship reaches :approved.
    # During DR/BR review the ship is still :pending, so fall back to the TA's value once it has
    # approved — otherwise the sidebar would show project.time_logged, which uses the persisted
    # youtube stretch_multiplier (not yet synced from TA annotations) and misleads the reviewer.
    public_seconds = ship.approved_public_seconds || (ship.time_audit_review&.approved? ? ship.time_audit_review.approved_public_seconds : nil)
    public_hrs = public_seconds ? (public_seconds / 3600.0).round(1) : nil
    internal_hrs = internal_hours_display(ship)
    entry_count = project.kept_journal_entries.size
    {
      id: project.id,
      name: project.name,
      description: project.description,
      repo_link: project.repo_link,
      demo_link: project.demo_link,
      tags: project.tags,
      created_at: project.created_at.strftime("%b %d, %Y"),
      user_id: project.user_id,
      user_display_name: project.user.display_name,
      user_avatar: project.user.avatar,
      user_slack_id: project.user.slack_id, # Admin-only context; review pages are staff-only
      collaborators: project.collaborator_users.map { |u| { id: u.id, display_name: u.display_name, avatar: u.avatar } },
      logged_hours: logged,
      approved_public_hours: public_hrs,
      approved_internal_hours: internal_hrs,
      entry_count: entry_count,
      ship_type: ship.ship_type,
      frozen_repo_link: ship.frozen_repo_link,
      frozen_demo_link: ship.frozen_demo_link,
      waiting_since: ship.created_at.iso8601,
      cycle_started_at: ship.cycle_started_at.iso8601
    }
  end

  def serialize_sibling_statuses(ship)
    {
      time_audit: ship.time_audit_review&.status,
      requirements_check: ship.requirements_check_review&.status,
      design_review: ship.design_review&.status,
      build_review: ship.build_review&.status
    }
  end

  def serialize_journal_entry(journal_entry, time_audit)
    annotations = time_audit&.annotations || {}
    recording_annotations = annotations["recordings"] || {}

    recordings_summary = journal_entry.recordings.map do |r|
      rec_id = r.id.to_s
      rec_data = recording_annotations[rec_id] || {}
      duration = recording_duration(r)
      segments = rec_data["segments"] || []
      # YouTube stretch_multiplier lets reviewers treat a YT video as a timelapse (e.g. ×60)
      multiplier = r.recordable.is_a?(YouTubeVideo) ? (rec_data["stretch_multiplier"]&.to_f || 1.0) : 60.0

      removed_seconds = segments.sum do |seg|
        video_range = seg["end_seconds"].to_f - seg["start_seconds"].to_f
        real_range = video_range * multiplier
        case seg["type"]
        when "removed" then real_range
        when "deflated" then real_range * (seg["deflated_percent"].to_f / 100)
        else 0
        end
      end

      {
        id: r.id,
        name: r.recordable.try(:name) || r.recordable.try(:title) || "Recording",
        type: r.recordable_type,
        duration: duration,
        description: rec_data["description"],
        removed_seconds: removed_seconds.round
      }
    end

    total_duration = journal_entry.recordings.sum { |r| recording_duration(r) }
    approved_duration = recordings_summary.sum { |r| [ 0, r[:duration] - r[:removed_seconds] ].max }

    {
      id: journal_entry.id,
      content_html: helpers.render_user_markdown(journal_entry.content.to_s),
      images: journal_entry.images.map { |img| url_for(img) },
      author_display_name: journal_entry.user.display_name,
      author_avatar: journal_entry.user.avatar,
      created_at: journal_entry.created_at.strftime("%b %d, %Y"),
      total_duration: total_duration,
      approved_duration: approved_duration,
      recordings: recordings_summary
    }
  end

  def recording_duration(recording)
    case recording.recordable
    when LookoutTimelapse, LapseTimelapse then recording.recordable.duration.to_i
    when YouTubeVideo then recording.recordable.duration_seconds.to_i * (recording.recordable.stretch_multiplier || 1)
    else 0
    end
  end

  # nil when nothing has been approved or adjusted yet, so the UI shows blank
  # instead of "0.0h" for ships still in flight.
  def internal_hours_display(ship)
    seconds = ship.approved_internal_seconds
    return nil if seconds.zero?
    (seconds / 3600.0).round(1)
  end

  # -- Header stats (index pages) --
  #
  # Computes a per-queue snapshot for the review index header. `include` is the
  # ordered list of stat keys to compute; controllers pass only the keys their
  # queue surfaces (e.g. TA only wants :turnaround).
  #
  # Returned shape (each key is optional, only present if requested):
  #   {
  #     hours_pending: { value: 12.3 },                                            # snapshot, no delta
  #     turnaround:    { ship_days: 3.1, cycle_days: 4.2, count: 7, delta: -0.4 }, # negative delta = faster
  #     approval_ratio:{ percent: 70.0, count: 10, delta: 5.0 },                   # positive delta = more approvals
  #     reship_ratio:  { percent: 20.0, count: 10, delta: -3.0 }                   # negative delta = fewer reships
  #   }
  #
  # Windowed stats compare the last 7d against the prior 7d (days 7-14 ago).
  # Delta is nil when the prior window had zero qualifying reviews — leaving
  # the chevron off rather than rendering a misleading "infinite improvement".
  STATS_WINDOW = 7.days
  STATS_CACHE_TTL = 5.minutes

  # Stats arrive deferred (heavy aggregates off the critical path), but the layout
  # needs to know which cards are coming so it can reserve their slots and avoid
  # CLS when the deferred payload lands. Keys are passed eagerly alongside the
  # deferred `stats` prop.
  REVIEW_STAT_KEYS = {
    "TimeAuditReview" => %i[ turnaround ],
    "RequirementsCheckReview" => %i[ turnaround approval_ratio reship_ratio ],
    "DesignReview" => %i[ hours_pending turnaround approval_ratio ],
    "BuildReview" => %i[ hours_pending turnaround approval_ratio ]
  }.freeze

  def review_stats_props(model)
    keys = REVIEW_STAT_KEYS.fetch(model.name)
    {
      stats_keys: keys,
      stats: InertiaRails.defer { compute_review_stats(model, include: keys) }
    }
  end

  # Cache key is bumped whenever any review of this type is touched (max updated_at).
  # Means a freshly-submitted review invalidates the cache on the next index load
  # without per-row tracking. Falls back to a fixed key when the table is empty.
  #
  # Perf: MAX(updated_at) without an index does a sequential scan; on current
  # data sizes (low thousands of reviews) this is sub-millisecond. If the tables
  # grow significantly, add an index on updated_at or switch to TTL-only invalidation.
  def compute_review_stats(model, include:)
    cache_stamp = model.maximum(:updated_at)&.to_i || 0
    Rails.cache.fetch(
      "admin/reviews/stats/#{model.name}/v2/#{include.join(',')}/#{cache_stamp}",
      expires_in: STATS_CACHE_TTL
    ) do
      build_review_stats(model, include)
    end
  end

  def build_review_stats(model, include)
    now = Time.current
    completion_col = model == TimeAuditReview ? :completed_at : :updated_at
    current_window = (now - STATS_WINDOW)..now
    prior_window = (now - 2 * STATS_WINDOW)..(now - STATS_WINDOW)

    stats = {}
    stats[:hours_pending] = stat_hours_pending(model) if include.include?(:hours_pending)
    stats[:turnaround] = stat_turnaround(model, completion_col, current_window, prior_window) if include.include?(:turnaround)
    stats[:approval_ratio] = stat_approval_ratio(model, completion_col, current_window, prior_window) if include.include?(:approval_ratio)
    stats[:reship_ratio] = stat_reship_ratio(model, completion_col, current_window, prior_window) if include.include?(:reship_ratio)
    stats
  end

  # Sum of TA-approved hours across ships currently waiting in this queue. DR/BR
  # only — RC/TA precede the TA-approval gate so the metric is undefined for them.
  # Uses time_audit_reviews.approved_public_seconds rather than ships.approved_public_seconds
  # because the latter is only mirrored once the ship reaches :approved (DR/BR phase still pending).
  def stat_hours_pending(model)
    seconds = model.pending
      .joins(ship: :time_audit_review)
      .where(time_audit_reviews: { status: TimeAuditReview.statuses[:approved] })
      .sum("time_audit_reviews.approved_public_seconds")
    { value: (seconds.to_f / 3600.0).round(1) }
  end

  def stat_turnaround(model, completion_col, current_window, prior_window)
    current = turnaround_for_window(model, completion_col, current_window)
    prior = turnaround_for_window(model, completion_col, prior_window)
    ship_delta = (current[:ship_days] && prior[:ship_days]) ? (current[:ship_days] - prior[:ship_days]).round(1) : nil
    cycle_delta = (current[:cycle_days] && prior[:cycle_days]) ? (current[:cycle_days] - prior[:cycle_days]).round(1) : nil
    current.merge(ship_delta: ship_delta, cycle_delta: cycle_delta)
  end

  # Returns { ship_days:, cycle_days:, count: }. Pluck (completion_at, ship_id)
  # instead of loading full review rows — review tables carry a jsonb annotations
  # column we don't need here. Ships are loaded once by id and run through
  # Ship.preload_cycle_started_at to hit the shared Rails.cache.
  #
  # Status filter uses the positive set (decided enum values) so Postgres can hit
  # the status index directly instead of NOT-IN'ing pending+cancelled.
  def turnaround_for_window(model, completion_col, window)
    decided = [ model.statuses[:approved], model.statuses[:returned], model.statuses[:rejected] ]
    pairs = model.where(completion_col => window)
      .where(status: decided)
      .pluck(completion_col, :ship_id)
    return { ship_days: nil, cycle_days: nil, count: 0 } if pairs.empty?

    ships_by_id = Ship.where(id: pairs.map(&:last).uniq).index_by(&:id)
    Ship.preload_cycle_started_at(ships_by_id.values)

    ship_sum = 0.0
    cycle_sum = 0.0
    pairs.each do |completed, ship_id|
      ship = ships_by_id[ship_id]
      next unless ship && completed
      ship_sum += completed - ship.created_at
      cycle_sum += completed - ship.cycle_started_at
    end
    count = pairs.size
    {
      ship_days: (ship_sum / count / 86_400.0).round(1),
      cycle_days: (cycle_sum / count / 86_400.0).round(1),
      count: count
    }
  end

  def stat_approval_ratio(model, completion_col, current_window, prior_window)
    current = approval_ratio_for_window(model, completion_col, current_window)
    prior = approval_ratio_for_window(model, completion_col, prior_window)
    delta = (current[:percent] && prior[:percent]) ? (current[:percent] - prior[:percent]).round(1) : nil
    current.merge(delta: delta)
  end

  # Two simple counts instead of group(:status).count — the latter's hash keys
  # vary by Rails version (integer raw vs enum string), which silently resolved
  # `approved` to 0 and reported 0%. Two indexed COUNT queries are cheap and
  # leave no room for enum-key ambiguity.
  def approval_ratio_for_window(model, completion_col, window)
    scope = model.where(completion_col => window).where(status: [
      model.statuses[:approved], model.statuses[:returned], model.statuses[:rejected]
    ])
    total = scope.count
    return { percent: nil, count: 0 } if total.zero?
    approved = scope.where(status: model.statuses[:approved]).count
    { percent: ((approved.to_f / total) * 100).round(1), count: total }
  end

  def stat_reship_ratio(model, completion_col, current_window, prior_window)
    current = reship_ratio_for_window(model, completion_col, current_window)
    prior = reship_ratio_for_window(model, completion_col, prior_window)
    delta = (current[:percent] && prior[:percent]) ? (current[:percent] - prior[:percent]).round(1) : nil
    current.merge(delta: delta)
  end

  # Reship = ship with a prior returned/rejected ship for the same project.
  # Approved siblings are excluded — a follow-on after a clean approval is a new
  # cycle, not a "redo" of a failed attempt.
  #
  # Two simple counts (total + reships-with-EXISTS) rather than one COUNT FILTER —
  # keeps the AR-pluck path straightforward and avoids the same Arel.sql-aggregate
  # pitfall that silently zeroed the approval ratio.
  def reship_ratio_for_window(model, completion_col, window)
    decided = [ model.statuses[:approved], model.statuses[:returned], model.statuses[:rejected] ]
    scope = model.joins(:ship)
      .where(model.table_name => { completion_col => window })
      .where(status: decided)

    total = scope.count
    return { percent: nil, count: 0 } if total.zero?

    reships = scope.where(<<~SQL.squish, returned: Ship.statuses[:returned], rejected: Ship.statuses[:rejected]).count
      EXISTS (
        SELECT 1 FROM ships s2
        WHERE s2.project_id = ships.project_id
          AND s2.created_at < ships.created_at
          AND s2.status IN (:returned, :rejected)
      )
    SQL

    { percent: ((reships.to_f / total) * 100).round(1), count: total }
  end

  # Resolves a verified checkpoint message URL for the project owner.
  # If a permalink is provided, it verifies it mentions the user. Otherwise,
  # it searches the channel history automatically.
  # Returns [url_or_nil, failure_reason_or_nil] where failure_reason is
  # :not_found or :wrong_mention so callers can surface the right error.
  def resolve_checkpoint_message(slack_id, provided_permalink)
    if provided_permalink.present?
      result = SlackCheckpointService.verify_permalink(provided_permalink, slack_id)
      result == :ok ? [ provided_permalink, nil ] : [ nil, result ]
    else
      url = SlackCheckpointService.find_checkpoint_message(slack_id)
      [ url, url ? nil : :not_found ]
    end
  end
end
