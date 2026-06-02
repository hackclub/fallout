class Admin::Reviews::RequirementsChecksController < Admin::Reviews::BaseController
  def index
    base = policy_scope(RequirementsCheckReview)
      .includes(ship: [ :project, :time_audit_review, project: :user ], reviewer: [])

    pending_reviews = base.pending.where.not(ship_id: flagged_ship_ids).order(created_at: :asc).load
    @pagy, @all_reviews = pagy(base.order(created_at: :desc))
    Ship.preload_cycle_started_at((pending_reviews + @all_reviews).map(&:ship)) # avoid N+1 in serialize_review_row (dedup done inside)
    flagged_ids = ProjectFlag.distinct.pluck(:project_id).to_set
    previously_reviewed = precompute_previously_reviewed_project_ids
    lifetime_hours = precompute_user_lifetime_hours(pending_reviews)

    render inertia: {
      pending_reviews: pending_reviews.map { |r| serialize_review_row(r, previously_reviewed_project_ids: previously_reviewed, user_lifetime_hours: lifetime_hours) },
      all_reviews: @all_reviews.map { |r| serialize_review_row(r, flagged_project_ids: flagged_ids, previously_reviewed_project_ids: previously_reviewed) },
      pagy: pagy_props(@pagy),
      start_reviewing_path: next_admin_reviews_requirements_checks_path,
      **review_stats_props(RequirementsCheckReview)
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
      new_entries: new_entries.map { |je| serialize_journal_entry(je, time_audit) },
      previous_entries: previous_entries.map { |je| serialize_journal_entry(je, time_audit) },
      sibling_statuses: serialize_sibling_statuses(ship),
      previous_reviews: serialize_previous_reviews(project, ship, RequirementsCheckReview, DesignReview),
      repo_tree: @review.repo_tree,
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

    # Checkpoint message is optional — attempt lookup on terminal submissions and attach if found,
    # but never block the review if no message exists.
    submitting_terminal = %w[approved returned rejected].include?(params.dig(:requirements_check_review, :status))
    checkpoint_just_stored = false
    if submitting_terminal && @review.checkpoint_message_url.blank?
      slack_id = @review.ship.project.user.slack_id
      url, _failure = resolve_checkpoint_message(slack_id, params.dig(:requirements_check_review, :checkpoint_message_url))
      if url
        @review.update_columns(checkpoint_message_url: url)
        checkpoint_just_stored = true
      end
    end

    if @review.update(review_params)
      if @review.approved? || @review.returned? || @review.rejected?
        if checkpoint_just_stored
          PostCheckpointThreadJob.perform_later(
            message_ts: SlackCheckpointService.extract_ts(@review.checkpoint_message_url),
            ship_id: @review.ship_id,
            review_type: "requirements_check",
            review_status: @review.status,
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
