class Admin::Reviews::BuildReviewBackfillsController < Admin::Reviews::BackfillBaseController
  def index
    authorize BuildReview, :index? # Restrict the queue listing to pass2 reviewers/admins (index bypasses policy_scope)
    reviews = backfill_scope
      .includes(ship: [ :time_audit_review, project: :user ])
      .joins(:ship).order("ships.created_at ASC").to_a
    Ship.preload_cycle_started_at(reviews.map(&:ship))
    render inertia: "admin/reviews/build_review_backfills/index", props: {
      start_reviewing_path: next_admin_reviews_build_review_backfills_path,
      reviews: reviews.map { |r| serialize_review_row(r) }
    }
  end

  def show
    authorize @review, :backfill?

    ship = @review.ship
    project = ship.project
    time_audit = ship.time_audit_review

    new_entries = ship.new_journal_entries
      .includes(:user, images_attachments: :blob, recordings: :recordable)
      .order(created_at: :asc)

    previous_entries = ship.previous_journal_entries
      .includes(:user, images_attachments: :blob, recordings: :recordable)
      .order(created_at: :asc)

    render inertia: "admin/reviews/build_reviews/show", props: {
      review: serialize_review_detail(@review),
      project: serialize_project_context(project, ship),
      new_entries: new_entries.map { |je| serialize_journal_entry(je, time_audit, ship) },
      previous_entries: previous_entries.map { |je| serialize_journal_entry(je, time_audit, ship) },
      sibling_statuses: serialize_sibling_statuses(ship),
      previous_reviews: serialize_previous_reviews(project, ship, RequirementsCheckReview, DesignReview, BuildReview),
      repo_tree: ship.requirements_check_review&.repo_tree,
      repo_diff: @review.repo_diff,
      reviewer_notes: InertiaRails.defer { serialize_reviewer_notes(project) },
      reviewer_notes_path: admin_project_reviewer_notes_path(project),
      project_flagged: project.flagged?,
      pending_conversion_koi: 0, # No conversion on backfill — the ship is already approved
      backfill: true,
      can: { update: policy(@review).backfill_update?, swap_type: false },
      skip: params[:skip],
      heartbeat_path: heartbeat_admin_reviews_build_review_backfill_path(@review),
      swap_type_path: nil,
      next_path: next_admin_reviews_build_review_backfills_path,
      index_path: admin_reviews_build_review_backfills_path
    }
  end

  def update
    authorize @review, :backfill_update?

    if @review.update(review_params)
      # Reviewer can still curate the project's demo_link during backfill (matches normal BR).
      # Written only after the review save succeeds so a failed/raised update never leaves the
      # project's demo_link changed against an unchanged review.
      if params.key?(:demo_link)
        @review.ship.project.update_column(:demo_link, params[:demo_link].presence)
      end
      # Backfilling internal_reason / hours_adjustment (and demo_link) changes the
      # unified-submission justification + override hours + playable URL, uploaded
      # one-shot at approval. Re-run the idempotent upload so the external row matches.
      ShipUnifiedAirtableUploadJob.perform_later(@review.ship_id) if @review.ship.approved?
      redirect_to_next_backfill(notice: "Build review backfilled.")
    else
      redirect_back fallback_location: admin_reviews_build_review_backfill_path(@review),
                    inertia: { errors: @review.errors.messages }
    end
  end

  private

  def review_model
    BuildReview
  end

  # Backfill may only touch the internal fields — feedback, status, and the user-facing
  # gold_adjustment stay frozen.
  def review_params
    params.expect(build_review: [ :internal_reason, :hours_adjustment ])
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
      gold_adjustment: review.gold_adjustment,
      reviewer_display_name: review.reviewer&.display_name,
      project_name: ship.project.name,
      user_display_name: ship.project.user.display_name,
      preflight_results: ship.preflight_results,
      created_at: review.created_at.strftime("%B %d, %Y")
    }
  end
end
