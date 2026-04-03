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
    review = review_model.next_eligible(current_user, skip_ids:)

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
    had_claim = any_active_claim?
    Reviewable::REVIEW_MODELS.each { |name| name.constantize.release_all_claims!(current_user) }
    flash.now[:notice] = "Review session ended." if had_claim
  end

  def claim_review!
    had_claim = any_active_claim?

    # Release any existing claim by this user (one claim at a time across all types)
    Reviewable::REVIEW_MODELS.each { |name| name.constantize.release_all_claims!(current_user) }

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

  def any_active_claim?
    Reviewable::REVIEW_MODELS.any? { |name| name.constantize.active_claim_for(current_user).present? }
  end

  def parse_skip_ids
    (params[:skip] || "").split(",").filter_map { |id| id.to_i if id.present? }
  end

  def redirect_to_next_or_index(notice:)
    # Clear claim expiry but keep reviewer_id as audit trail on the completed review
    @review.update_columns(claim_expires_at: nil)
    skip_ids = parse_skip_ids << @review.id
    redirect_to review_next_path(skip: skip_ids.join(",")), notice: notice
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

  def serialize_review_row(review)
    ship = review.ship
    {
      id: review.id,
      ship_id: ship.id,
      project_name: ship.project.name,
      user_display_name: ship.project.user.display_name,
      status: review.status,
      reviewer_display_name: review.reviewer&.display_name,
      created_at: review.created_at.strftime("%b %d, %Y"),
      is_claimed: review.claimed?,
      claimed_by_display_name: review.claimed? ? review.reviewer&.display_name : nil
    }
  end
end
