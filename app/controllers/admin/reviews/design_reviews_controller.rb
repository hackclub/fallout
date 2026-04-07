class Admin::Reviews::DesignReviewsController < Admin::Reviews::BaseController
  def index
    base = policy_scope(DesignReview)
      .includes(ship: [ :project, project: :user ], reviewer: [])

    pending_reviews = base.pending.order(created_at: :asc).load
    @pagy, @all_reviews = pagy(base.order(created_at: :desc))

    render inertia: {
      pending_reviews: pending_reviews.map { |r| serialize_review_row(r) },
      all_reviews: @all_reviews.map { |r| serialize_review_row(r) },
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

    if @review.update(review_params)
      if @review.approved? || @review.returned? || @review.rejected?
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
    params.expect(design_review: [ :status, :feedback, :internal_reason, :lock_version ])
  end

  def serialize_review_detail(review)
    ship = review.ship
    {
      id: review.id,
      ship_id: ship.id,
      status: review.status,
      feedback: review.feedback,
      internal_reason: review.internal_reason,
      lock_version: review.lock_version,
      reviewer_display_name: review.reviewer&.display_name,
      project_name: ship.project.name,
      user_display_name: ship.project.user.display_name,
      preflight_results: ship.preflight_results,
      created_at: review.created_at.strftime("%B %d, %Y")
    }
  end
end
