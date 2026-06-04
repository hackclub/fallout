class Admin::Reviews::BuildReviewsController < Admin::Reviews::BaseController
  def index
    base = policy_scope(BuildReview)
      .includes(ship: [ :project, :time_audit_review, project: :user ], reviewer: [])

    # Order by ship.created_at so the longest-waiting ship floats to the top —
    # the BR row is created later (after TA approval), so BR.created_at doesn't
    # reflect how long the student has actually been waiting.
    pending_reviews = base.pending.where.not(ship_id: flagged_ship_ids).joins(:ship).order("ships.created_at ASC").load
    @pagy, @all_reviews = pagy(base.order(created_at: :desc))
    flagged_ids = ProjectFlag.distinct.pluck(:project_id).to_set
    Ship.preload_cycle_started_at((pending_reviews + @all_reviews).map(&:ship)) # avoid N+1 in serialize_review_row (dedup done inside)

    render inertia: {
      pending_reviews: pending_reviews.map { |r| serialize_review_row(r) },
      all_reviews: @all_reviews.map { |r| serialize_review_row(r, flagged_project_ids: flagged_ids) },
      pagy: pagy_props(@pagy),
      start_reviewing_path: next_admin_reviews_build_reviews_path,
      **review_stats_props(BuildReview)
    }
  end

  def show
    authorize @review

    ship = @review.ship
    project = ship.project
    time_audit = ship.time_audit_review
    project_owner = project.user

    new_entries = ship.new_journal_entries
      .includes(:user, images_attachments: :blob, recordings: :recordable)
      .order(created_at: :asc)

    previous_entries = ship.previous_journal_entries
      .includes(:user, images_attachments: :blob, recordings: :recordable)
      .order(created_at: :asc)

    # Conversion preview — show "Approval will convert N koi → N gold" only when this
    # BR is the project's first approved build (i.e., would actually trigger conversion).
    # `project.built_irl?` now reflects the user's declaration, not history, so check the
    # canonical ship history directly. We preview the project owner's conversion since
    # they're the primary recipient; collaborators get their own conversion at the same
    # trigger but aren't surfaced here.
    already_built = project.ships.approved.where(ship_type: :build).exists?
    pending_conversion_koi =
      if @review.pending? && !already_built
        BuiltIrlConversionService.compute_amount(ship, project_owner)
      else
        0
      end

    render inertia: {
      review: serialize_review_detail(@review),
      project: serialize_project_context(project, ship),
      new_entries: new_entries.map { |je| serialize_journal_entry(je, time_audit) },
      previous_entries: previous_entries.map { |je| serialize_journal_entry(je, time_audit) },
      sibling_statuses: serialize_sibling_statuses(ship),
      previous_reviews: serialize_previous_reviews(project, ship, DesignReview, BuildReview),
      repo_tree: ship.requirements_check_review&.repo_tree,
      reviewer_notes: InertiaRails.defer { serialize_reviewer_notes(project) },
      reviewer_notes_path: admin_project_reviewer_notes_path(project),
      project_flagged: project.flagged?,
      pending_conversion_koi: pending_conversion_koi,
      can: { update: policy(@review).update?, swap_type: policy(@review).swap_type? },
      skip: params[:skip],
      heartbeat_path: heartbeat_admin_reviews_build_review_path(@review),
      swap_type_path: swap_type_admin_reviews_build_review_path(@review),
      next_path: next_admin_reviews_build_reviews_path,
      index_path: admin_reviews_build_reviews_path
    }
  end

  def swap_type
    # Inline find — base controller's set_review only fires for show/update/heartbeat,
    # and redeclaring `before_action :set_review, only: %i[swap_type]` would dedup
    # against the parent (Rails set_callback removes prior entries with the same
    # symbol filter), breaking the base's filter for everything else.
    @review = BuildReview.find(params[:id])
    authorize @review, :swap_type?
    new_review = @review.ship.swap_phase_two_type!
    redirect_to admin_reviews_design_review_path(new_review), notice: "Moved to Design Review."
  rescue ActiveRecord::RecordInvalid => e
    redirect_back fallback_location: admin_reviews_build_review_path(@review), alert: "Could not swap: #{e.message}"
  end

  def update
    authorize @review

    # Reviewer can update the project's demo_link from the BR form — optional, blank clears it.
    # Authorization piggybacks on the BR update permission; we don't go through ProjectPolicy
    # because pass2 reviewers wouldn't normally have project edit rights.
    if params.key?(:demo_link)
      @review.ship.project.update_column(:demo_link, params[:demo_link].presence)
    end

    @review.finalizing_user = current_user # Reviewable#stamp_finalizing_reviewer backfills reviewer_id on terminal save when claim was cleared mid-session
    if @review.update(review_params)
      if @review.approved? || @review.returned? || @review.rejected?
        redirect_to_next_or_index(notice: "Build review #{@review.status}.")
      else
        redirect_to admin_reviews_build_review_path(@review, skip: params[:skip]), notice: "Build review updated."
      end
    else
      redirect_back fallback_location: admin_reviews_build_review_path(@review),
                    inertia: { errors: @review.errors.messages }
    end
  end

  private

  def review_model
    BuildReview
  end

  def review_params
    params.expect(build_review: [ :status, :feedback, :internal_reason, :hours_adjustment, :gold_adjustment ])
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
