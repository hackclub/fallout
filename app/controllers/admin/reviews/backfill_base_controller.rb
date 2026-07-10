class Admin::Reviews::BackfillBaseController < Admin::Reviews::BaseController
  # Backfill edits already-approved reviews, so the normal pending-claim lifecycle
  # doesn't apply. Skip it and swap in the isolated backfill-claim equivalents.
  # skip_before_action is a relaxing directive → only: (a forgotten action keeps the
  # stricter inherited behavior).
  skip_before_action :release_all_review_claims, only: %i[ index ]
  skip_before_action :claim_review!, only: %i[ show ]
  skip_before_action :extend_review_claim!, only: %i[ update ]

  before_action :release_all_backfill_claims, only: %i[ index ]
  before_action :claim_backfill!, only: %i[ show ]
  before_action :extend_backfill_claim_for_reviewer!, only: %i[ update ]

  def heartbeat
    authorize @review, :backfill?

    if @review.backfill_claimed_by?(current_user)
      @review.extend_backfill_claim!
      render json: { ok: true, expires_at: @review.backfill_claim_expires_at.iso8601 }
    else
      render json: { error: "claim_lost" }, status: :conflict
    end
  end

  # GET /admin/reviews/:type_backfills/next?skip=1,2,3
  def next
    authorize review_model, :index? # Gate the queue to pass2 reviewers/admins before enumerating reviews
    skip_ids = parse_skip_ids
    review = review_model.next_eligible_backfill(current_user, skip_ids:)

    if review
      redirect_to review_show_path(review, skip: skip_ids.any? ? skip_ids.join(",") : nil)
    else
      redirect_to review_index_path, notice: "No more reviews to backfill."
    end
  end

  private

  # Approved reviews still missing an internal justification, oldest submission first.
  def backfill_scope
    review_model.approved.where("internal_reason IS NULL OR internal_reason = ''")
  end

  def release_all_backfill_claims
    released = Backfillable::REVIEW_MODELS.sum { |name| name.constantize.release_all_backfill_claims!(current_user) }
    flash.now[:notice] = "Backfill session ended." if released.positive?
  end

  def claim_backfill!
    # One backfill claim at a time across the two phase-two backfill queues; isolated
    # from any normal pending-review claim the user may also hold.
    Backfillable::REVIEW_MODELS.each { |name| name.constantize.release_all_backfill_claims!(current_user) }

    claimed = review_model.atomic_backfill_claim!(@review.id, current_user)
    return if claimed || current_user.admin? # Admins can view without claiming

    unless @review.backfill_claimed_by?(current_user)
      # Claimed by someone else — auto-advance to next available
      skip_ids = parse_skip_ids << @review.id
      redirect_to review_next_path(skip: skip_ids.join(",")),
                  alert: "This review is being backfilled by #{@review.backfill_reviewer&.display_name || "someone else"}. Finding next..."
    end
  end

  def extend_backfill_claim_for_reviewer!
    @review.extend_backfill_claim! if @review.backfill_claimed_by?(current_user)
  end

  def redirect_to_next_backfill(notice:)
    @review.update_columns(backfill_claim_expires_at: nil) # Release claim; keep backfill_reviewer_id as audit trail
    skip_ids = parse_skip_ids << @review.id
    redirect_to review_next_path(skip: skip_ids.join(",")), notice: notice
  end
end
