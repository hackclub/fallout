class Admin::Reviews::RequirementsChecksController < Admin::Reviews::BaseController
  def index
    # parse_sort persists the sort preference in session — keep it on the critical path so the
    # eager current_sort prop is correct. The heavy queue lists are deferred behind a skeleton.
    sort = parse_sort
    ticket_eligible = parse_ticket_filter
    render inertia: {
      start_reviewing_path: next_admin_reviews_requirements_checks_path,
      current_sort: sort,
      ticket_eligible: ticket_eligible,
      **review_stats_props(RequirementsCheckReview),
      **deferred_index_props(sort, ticket_eligible)
    }
  end

  def show
    authorize @review

    ship = @review.ship
    project = ship.project
    time_audit = ship.time_audit_review

    new_entries = ship.new_journal_entries
      .includes(:user, images_attachments: :blob, recordings: :recordable)
      .order(created_at: :asc)

    previous_entries = ship.previous_journal_entries
      .includes(:user, images_attachments: :blob, recordings: :recordable)
      .order(created_at: :asc)

    render inertia: {
      review: serialize_review_detail(@review),
      project: serialize_project_context(project, ship),
      new_entries: new_entries.map { |je| serialize_journal_entry(je, time_audit, ship) },
      previous_entries: previous_entries.map { |je| serialize_journal_entry(je, time_audit, ship) },
      sibling_statuses: serialize_sibling_statuses(ship),
      previous_reviews: serialize_previous_reviews(project, ship, RequirementsCheckReview, DesignReview, BuildReview),
      repo_tree: @review.repo_tree,
      repo_diff: @review.repo_diff,
      refresh_tree_path: refresh_tree_admin_reviews_requirements_check_path(@review),
      reviewer_notes: InertiaRails.defer { serialize_reviewer_notes(project) },
      reviewer_notes_path: admin_project_reviewer_notes_path(project),
      project_flagged: project.flagged?,
      can: { update: policy(@review).update? },
      skip: params[:skip],
      heartbeat_path: heartbeat_admin_reviews_requirements_check_path(@review),
      next_path: review_next_path,
      index_path: admin_reviews_requirements_checks_path
    }
  end

  def refresh_tree
    @review = RequirementsCheckReview.find(params[:id])
    authorize @review, :update?
    FetchRepoTreeJob.perform_later(@review.id)
    render json: { ok: true }
  end

  def update
    authorize @review

    # Checkpoint message is optional — attach it if found, but never block the review. The Slack
    # lookup runs in a background job so the slow API calls don't time out the submit request.
    needs_checkpoint = @review.checkpoint_message_url.blank?
    provided_permalink = params.dig(:requirements_check_review, :checkpoint_message_url)

    @review.finalizing_user = current_user # Reviewable#stamp_finalizing_reviewer backfills reviewer_id on terminal save when claim was cleared mid-session
    if @review.update(review_params)
      if @review.approved? || @review.returned? || @review.rejected?
        if needs_checkpoint
          ResolveRequirementsCheckCheckpointJob.perform_later(
            review_id: @review.id,
            provided_permalink: provided_permalink,
            base_url: request.base_url,
            project_url: project_url(@review.ship.project),
            repo_url: @review.ship.project.repo_link
          )
        end
        redirect_to_next_or_index(notice: "Requirements check #{@review.status}.")
      else
        redirect_to admin_reviews_requirements_check_path(@review, skip: params[:skip]), notice: "Requirements check updated."
      end
    else
      redirect_back fallback_location: admin_reviews_requirements_check_path(@review),
                    inertia: { errors: @review.errors.messages }
    end
  end

  private

  # Memoized loader shared by the deferred index props so the heavy queue query runs once per
  # deferred request even though pending_reviews/all_reviews/pagy are separate Inertia props.
  def deferred_index_props(sort, ticket_eligible)
    memo = nil
    load = lambda do
      memo ||= begin
        base = policy_scope(RequirementsCheckReview)
          .includes(ship: [ :project, :time_audit_review, project: :user ], reviewer: [])

        pending_reviews = base.pending.where.not(ship_id: flagged_ship_ids).joins(:ship).order("ships.created_at ASC").load
        pending_reviews = filter_ticket_eligible(pending_reviews) if ticket_eligible
        @pagy, @all_reviews = pagy(base.order(created_at: :desc))
        Ship.preload_cycle_started_at((pending_reviews + @all_reviews).map(&:ship)) # avoid N+1 in serialize_review_row (dedup done inside)
        flagged_ids = ProjectFlag.distinct.pluck(:project_id).to_set
        page_project_ids = (pending_reviews + @all_reviews).map { |r| r.ship.project_id }.uniq
        previously_reviewed = precompute_previously_reviewed_project_ids(page_project_ids)
        lifetime_hours = precompute_user_lifetime_hours(pending_reviews)
        priority_ids = ReviewPriorityCalculator.priority_ship_ids(pending_reviews.map(&:ship))
        pending_reviews = sort_pending(pending_reviews, sort, lifetime_hours, priority_ids)
        {
          pending_reviews: pending_reviews.map { |r| serialize_review_row(r, previously_reviewed_project_ids: previously_reviewed, user_lifetime_hours: lifetime_hours, priority_ship_ids: priority_ids) },
          all_reviews: @all_reviews.map { |r| serialize_review_row(r, flagged_project_ids: flagged_ids, previously_reviewed_project_ids: previously_reviewed) },
          pagy: pagy_props(@pagy)
        }
      end
    end
    {
      pending_reviews: InertiaRails.defer(group: "index") { load.call[:pending_reviews] },
      all_reviews: InertiaRails.defer(group: "index") { load.call[:all_reviews] },
      pagy: InertiaRails.defer(group: "index") { load.call[:pagy] }
    }
  end

  def review_model
    RequirementsCheckReview
  end

  def review_params
    params.expect(requirements_check_review: [ :status, :feedback, :internal_reason ])
  end

  def serialize_review_detail(review)
    ship = review.ship
    {
      id: review.id,
      ship_id: ship.id,
      status: review.status,
      feedback: review.feedback,
      internal_reason: review.internal_reason,
      reviewer_display_name: review.reviewer&.display_name,
      project_name: ship.project.name,
      user_display_name: ship.project.user.display_name,
      preflight_results: ship.preflight_results,
      created_at: review.created_at.strftime("%B %d, %Y"),
      checkpoint_message_url: review.checkpoint_message_url
    }
  end
end
