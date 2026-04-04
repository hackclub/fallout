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
      end
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
