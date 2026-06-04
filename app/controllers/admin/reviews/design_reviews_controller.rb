class Admin::Reviews::DesignReviewsController < Admin::Reviews::BaseController
  def index
    base = policy_scope(DesignReview)
      .includes(ship: [ :project, :time_audit_review, project: :user, requirements_check_review: :reviewer ], reviewer: [])

    sort = parse_sort
    # Order by ship.created_at so the longest-waiting ship floats to the top —
    # the DR row is created later (after TA approval), so DR.created_at doesn't
    # reflect how long the student has actually been waiting.
    pending_reviews = base.pending.where.not(ship_id: flagged_ship_ids).joins(:ship).order("ships.created_at ASC").load
    @pagy, @all_reviews = pagy(base.order(created_at: :desc))
    flagged_ids = ProjectFlag.distinct.pluck(:project_id).to_set
    Ship.preload_cycle_started_at((pending_reviews + @all_reviews).map(&:ship)) # avoid N+1 in serialize_review_row (dedup done inside)
    previously_reviewed = precompute_previously_reviewed_project_ids
    lifetime_hours = precompute_user_lifetime_hours(pending_reviews)
    pending_reviews = pending_reviews.sort_by { |review| -(lifetime_hours[review.ship.project.user_id] || -1) } if sort == :hours

    render inertia: {
      pending_reviews: pending_reviews.map { |r| serialize_review_row(r, previously_reviewed_project_ids: previously_reviewed, user_lifetime_hours: lifetime_hours) },
      all_reviews: @all_reviews.map { |r| serialize_review_row(r, flagged_project_ids: flagged_ids, previously_reviewed_project_ids: previously_reviewed) },
      pagy: pagy_props(@pagy),
      start_reviewing_path: next_admin_reviews_design_reviews_path,
      current_sort: sort,
      **review_stats_props(DesignReview)
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
      previous_reviews: serialize_previous_reviews(project, ship, DesignReview),
      repo_tree: ship.requirements_check_review&.repo_tree,
      reviewer_notes: InertiaRails.defer { serialize_reviewer_notes(project) },
      reviewer_notes_path: admin_project_reviewer_notes_path(project),
      project_flagged: project.flagged?,
      can: { update: policy(@review).update?, swap_type: policy(@review).swap_type? },
      skip: params[:skip],
      heartbeat_path: heartbeat_admin_reviews_design_review_path(@review),
      swap_type_path: swap_type_admin_reviews_design_review_path(@review),
      next_path: review_next_path,
      index_path: admin_reviews_design_reviews_path
    }
  end

  def swap_type
    # Inline find — declaring `before_action :set_review, only: %i[swap_type]` in this
    # subclass would dedup against the parent's set_review (Rails set_callback removes
    # prior entries with the same symbol filter), nuking the base's `only:` and breaking
    # show/update/heartbeat. Match the pattern used by RequirementsChecksController's
    # custom actions instead.
    @review = DesignReview.find(params[:id])
    authorize @review, :swap_type?
    new_review = @review.ship.swap_phase_two_type!
    redirect_to admin_reviews_build_review_path(new_review), notice: "Moved to Build Review."
  rescue ActiveRecord::RecordInvalid => e
    redirect_back fallback_location: admin_reviews_design_review_path(@review), alert: "Could not swap: #{e.message}"
  end

  def update
    authorize @review

    submitting_terminal = %w[approved returned rejected].include?(params.dig(:design_review, :status))
    checkpoint_just_stored = false
    if submitting_terminal && @review.checkpoint_message_url.blank?
      slack_id = @review.ship.project.user.slack_id
      url, failure = resolve_checkpoint_message(slack_id, params.dig(:design_review, :checkpoint_message_url))
      if url.nil?
        msg = failure == :wrong_mention \
          ? "That message doesn't mention @#{@review.ship.project.user.display_name}. Did you tag the wrong person?" \
          : "No checkpoint message found in #fallout-checkpoint mentioning this user in the past 24 hours. Please paste the message link."
        return redirect_back fallback_location: admin_reviews_design_review_path(@review),
                             inertia: { errors: { checkpoint_message_url: [ msg ] } }
      end
      @review.update_columns(checkpoint_message_url: url)
      checkpoint_just_stored = true
    end

    stamp_reviewer_for_terminal!(params.dig(:design_review, :status))
    if @review.update(review_params)
      if @review.approved? || @review.returned? || @review.rejected?
        if checkpoint_just_stored
          PostCheckpointThreadJob.perform_later(
            message_ts: SlackCheckpointService.extract_ts(@review.checkpoint_message_url),
            ship_id: @review.ship_id,
            review_type: "design_review",
            review_status: @review.status,
            base_url: request.base_url,
            project_url: project_url(@review.ship.project),
            repo_url: @review.ship.project.repo_link
          )
        end
        redirect_to_next_or_index(notice: "Design review #{@review.status}.")
      else
        redirect_to admin_reviews_design_review_path(@review, skip: params[:skip]), notice: "Design review updated."
      end
    else
      redirect_back fallback_location: admin_reviews_design_review_path(@review),
                    inertia: { errors: @review.errors.messages }
    end
  end

  private

  def review_model
    DesignReview
  end

  def review_params
    params.expect(design_review: [ :status, :feedback, :internal_reason, :hours_adjustment, :koi_adjustment ])
  end

  def serialize_review_detail(review)
    ship = review.ship
    {
      id: review.id,
      ship_id: ship.id,
      status: review.status,
      feedback: review.feedback,
      internal_reason: review.internal_reason,
      hours_adjustment: review.hours_adjustment,
      koi_adjustment: review.koi_adjustment,
      reviewer_display_name: review.reviewer&.display_name,
      project_name: ship.project.name,
      user_display_name: ship.project.user.display_name,
      preflight_results: ship.preflight_results,
      created_at: review.created_at.strftime("%B %d, %Y"),
      checkpoint_message_url: review.checkpoint_message_url
    }
  end
end
