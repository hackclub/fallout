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
      raise ActionController::RoutingError, "Not Found" unless current_user.admin? || current_user.reviewer? # Admins and reviewers can browse other reviewers' history
      @user = User.find(params[:user_id])
    else
      @user = current_user
    end

    terminal = %w[approved returned rejected]

    reviews = REVIEW_CLASSES.flat_map do |type_key, klass|
      klass
        .where(reviewer_id: @user.id, status: terminal)
        .joins(ship: :project)
        .select("#{klass.table_name}.*, projects.id AS project_id, projects.name AS project_name")
        .map do |review|
          {
            completed_ts:    (review.completed_at || review.updated_at).to_i,
            review_id:       review.id,
            review_type:     type_key,
            ship_id:         review.ship_id,
            project_id:      review.project_id,
            project_name:    review.project_name,
            status:          review.status,
            feedback:        review.feedback,
            internal_reason: review.try(:internal_reason),
            reviewed_at:     review.updated_at.strftime("%b %d, %Y")
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
      reviews: reviews,
      is_own:  @user.id == current_user.id
    }
  end
end
