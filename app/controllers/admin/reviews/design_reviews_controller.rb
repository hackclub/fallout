class Admin::Reviews::DesignReviewsController < Admin::Reviews::BaseController
  def index
    base = policy_scope(DesignReview)
      .includes(ship: [ :project, project: :user, requirements_check_review: :reviewer ], reviewer: [])

    pending_reviews = base.pending.where.not(ship_id: flagged_ship_ids).order(created_at: :asc).load
    @pagy, @all_reviews = pagy(base.order(created_at: :desc))
    flagged_ids = ProjectFlag.distinct.pluck(:project_id).to_set

    render inertia: {
      pending_reviews: pending_reviews.map { |r| serialize_review_row(r) },
      all_reviews: @all_reviews.map { |r| serialize_review_row(r, flagged_project_ids: flagged_ids) },
      pagy: pagy_props(@pagy),
      start_reviewing_path: next_admin_reviews_design_reviews_path
    }
  end

  def show
    authorize @review

    ship = @review.ship
    project = ship.project
    time_audit = ship.time_audit_review

    new_entries = ship.new_journal_entries
      .includes(:user, :images_attachments, recordings: :recordable)
      .order(created_at: :asc)

    previous_entries = ship.previous_journal_entries
      .includes(:user, :images_attachments, recordings: :recordable)
      .order(created_at: :asc)

    render inertia: {
      review: serialize_review_detail(@review),
      project: serialize_project_context(project, ship),
      new_entries: new_entries.map { |je| serialize_journal_entry(je, time_audit) },
      previous_entries: previous_entries.map { |je| serialize_journal_entry(je, time_audit) },
      sibling_statuses: serialize_sibling_statuses(ship),
      repo_tree: ship.requirements_check_review&.repo_tree,
      reviewer_notes: InertiaRails.defer { serialize_reviewer_notes(project) },
      reviewer_notes_path: admin_project_reviewer_notes_path(project),
      project_flagged: project.flagged?,
      can: { update: policy(@review).update? },
      skip: params[:skip],
      heartbeat_path: heartbeat_admin_reviews_design_review_path(@review),
      next_path: next_admin_reviews_design_reviews_path,
      index_path: admin_reviews_design_reviews_path
    }
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
