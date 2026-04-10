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

  CENSORED_FIELD_PATTERNS = %w[secret token key password encrypted].freeze

  ENUM_MAPPINGS = {
    "StreakDay" => {
      "status" => StreakDay.statuses.invert.transform_values(&:to_s)
    }
  }.freeze

  def serialize_audit_log(record, extra_versions: [])
    versions = record.versions.order(created_at: :desc).to_a + extra_versions
    versions.sort_by! { |v| v.created_at }.reverse!
    return [] if versions.empty?

    whodunnit_ids = versions.map(&:whodunnit).compact.uniq
    users_by_id = User.where(id: whodunnit_ids).index_by { |u| u.id.to_s }

    streak_day_ids = versions.select { |v| v.item_type == "StreakDay" }.map(&:item_id).uniq
    streak_day_dates = streak_day_ids.any? ? StreakDay.where(id: streak_day_ids).pluck(:id, :date).to_h : {}

    versions.map do |version|
      changes = if version.event == "update" && version.object_changes.present?
        version.object_changes.filter_map do |key, values|
          next if key == "updated_at"

          censored = CENSORED_FIELD_PATTERNS.any? { |p| key.include?(p) }
          enum_map = ENUM_MAPPINGS.dig(version.item_type, key)
          {
            field: key,
            before: censored ? "[HIDDEN]" : format_audit_value(enum_map ? enum_map[values[0]] || values[0] : values[0]),
            after: censored ? "[HIDDEN]" : format_audit_value(enum_map ? enum_map[values[1]] || values[1] : values[1])
          }
        end
      else
        []
      end

      label = version.item_type
      if version.item_type == "StreakDay"
        date = version.object_changes&.dig("date")&.last || streak_day_dates[version.item_id]
        label = "Streak Day#{date ? " (#{date})" : ""}"
      end

      {
        id: version.id,
        event: version.event,
        item_label: label,
        whodunnit_name: users_by_id[version.whodunnit]&.display_name,
        created_at: version.created_at.strftime("%b %d, %Y at %l:%M %p"),
        changes: changes
      }
    end
  end

  def format_audit_value(value)
    str = value.is_a?(Array) ? value.join(", ") : value.to_s
    str.truncate(80)
  end
end
