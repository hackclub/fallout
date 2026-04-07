class Admin::ApplicationController < ApplicationController
  before_action :require_staff!

  # Sidebar stat pills — deferred so they never block page loads
  inertia_share do
    {
      admin_stats: InertiaRails.defer do
        {
          users_count: User.verified.count,
          projects_count: Project.count,
          pending_reviews_count: Ship.pending.count,
          pending_time_audits_count: TimeAuditReview.pending.count,
          pending_requirements_checks_count: RequirementsCheckReview.pending.count,
          pending_design_reviews_count: DesignReview.pending.count,
          pending_build_reviews_count: BuildReview.pending.count,
          flagged_projects_count: ProjectFlag.select(:project_id).distinct.count
        }
      end,
      # Role-based access for sidebar and frontend gating
      admin_permissions: {
        is_admin: current_user&.admin? || false,
        can_review_time_audits: current_user&.can_review?(:time_audit) || false,
        can_review_requirements_checks: current_user&.can_review?(:requirements_check) || false,
        can_review_design_reviews: current_user&.can_review?(:design_review) || false,
        can_review_build_reviews: current_user&.can_review?(:build_review) || false
      }
    }
  end

  private

  def require_staff!
    raise ActionController::RoutingError, "Not Found" unless current_user&.staff?
  end

  def require_admin!
    raise ActionController::RoutingError, "Not Found" unless current_user&.admin?
  end
end
