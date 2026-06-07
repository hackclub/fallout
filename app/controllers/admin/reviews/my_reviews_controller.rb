class Admin::Reviews::MyReviewsController < Admin::ApplicationController
  skip_after_action :verify_authorized   # No authorizable resource; access enforced inline below
  skip_after_action :verify_policy_scoped # No scoped collection

  REVIEW_CLASSES = {
    "requirements_check_review" => RequirementsCheckReview,
    "design_review"             => DesignReview,
    "build_review"              => BuildReview,
    "time_audit_review"         => TimeAuditReview
  }.freeze

  def show
    if params[:user_id]
      require_admin! # Only admins can view other reviewers' history
      @user = User.find(params[:user_id])
    else
      @user = current_user
    end

    terminal = %w[approved returned rejected]
    undo_cutoff = Admin::Reviews::BaseController::UNDO_WINDOW.ago

    reviews = REVIEW_CLASSES.flat_map do |type_key, klass|
      klass
        .where(reviewer_id: @user.id, status: terminal)
        .joins(ship: :project)
        .select("#{klass.table_name}.*, projects.id AS project_id, projects.name AS project_name")
        .map do |review|
          completed = review.completed_at || review.updated_at
          {
            completed_ts:    completed.to_i,
            review_id:       review.id,
            review_type:     type_key,
            ship_id:         review.ship_id,
            project_id:      review.project_id,
            project_name:    review.project_name,
            status:          review.status,
            feedback:        review.feedback,
            internal_reason: review.try(:internal_reason),
            reviewed_at:     review.updated_at.strftime("%b %d, %Y"),
            undoable:        completed >= undo_cutoff
          }
        end
    end
      .sort_by { |r| -r[:completed_ts] }
      .map { |r| r.except(:completed_ts) }

    render inertia: "admin/reviews/my_reviews/show", props: {
      reviewed_user: {
        id:           @user.id,
        display_name: @user.display_name,
        avatar:       @user.avatar
      },
      reviews:             reviews,
      is_own:              @user.id == current_user.id,
      undo_window_minutes: (Admin::Reviews::BaseController::UNDO_WINDOW / 60).to_i
    }
  end
end
