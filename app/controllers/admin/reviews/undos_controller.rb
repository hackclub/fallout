class Admin::Reviews::UndosController < Admin::ApplicationController
  skip_after_action :verify_authorized   # No authorizable resource; access enforced inline below
  skip_after_action :verify_policy_scoped # No scoped collection

  REVIEW_CLASSES = {
    "requirements_check_review" => RequirementsCheckReview,
    "design_review"             => DesignReview,
    "build_review"              => BuildReview,
    "time_audit_review"         => TimeAuditReview
  }.freeze

  def create
    klass = REVIEW_CLASSES[params[:review_type]]
    return redirect_back fallback_location: admin_reviews_mine_path,
                         alert: "Invalid review type." unless klass

    review = klass.find(params[:review_id])

    unless current_user.admin? || review.reviewer_id == current_user.id
      return redirect_back fallback_location: admin_reviews_mine_path,
                           alert: "Not authorized."
    end

    undo_window = Admin::Reviews::BaseController::UNDO_WINDOW

    # Lock the review row so concurrent undo requests both block here; the second
    # request will re-read status as pending after the first commits and bail out.
    review.with_lock do
      completed = review.completed_at || review.updated_at
      unless completed >= undo_window.ago
        return redirect_back fallback_location: admin_reviews_mine_path,
                             alert: "Review is too old to undo (#{undo_window / 60} minute limit)."
      end

      unless %w[approved returned rejected].include?(review.status)
        return redirect_back fallback_location: admin_reviews_mine_path,
                             alert: "Review is already pending."
      end

      # update_columns bypasses the terminal-status transition guard so we can reset to pending.
      # completed_at and claim_expires_at are cleared so the review re-enters the queue cleanly.
      review.update_columns(
        status:           klass.statuses[:pending],
        reviewer_id:      nil,
        completed_at:     nil,
        claim_expires_at: nil
      )
    end

    review.ship.with_lock do
      review.ship.ensure_phase_two_review!
      review.ship.recompute_status!(force: true)
    end

    redirect_back fallback_location: admin_reviews_mine_path
  end
end
