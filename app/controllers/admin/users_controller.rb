class Admin::UsersController < Admin::ApplicationController
  before_action :require_admin!, except: [ :index, :show ] # index/show open to all staff; policy_scope and authorize gate access

  def index
    base_scope = policy_scope(User)
    base_scope = base_scope.verified unless params[:include_trial] == "1"
    base_scope = base_scope.kept unless params[:include_deleted] == "1"
    search_scope = base_scope
    search_scope = search_scope.search_for(params[:query]) if params[:query].present?
    @pagy, @users = pagy(search_scope.order(created_at: :desc))
    @projects_counts = Project.where(user_id: @users.map(&:id)).group(:user_id).count

    render inertia: {
      users: @users.map { |u| serialize_user_row(u) },
      pagy: pagy_props(@pagy),
      query: params[:query].to_s,
      include_trial: params[:include_trial] == "1",
      include_deleted: params[:include_deleted] == "1",
      total_count: base_scope.count
    }
  end

  def show
    @user = User.find(params[:id])
    authorize @user
    @projects_count = @user.projects.kept.count

    props = {
      user: serialize_user_detail(@user),
      valid_roles: current_user.admin? ? User::VALID_ROLES : [], # Only admins can edit roles
      is_self: @user == current_user,
      project_data: InertiaRails.defer {
        base_scope = @user.projects
        base_scope = base_scope.kept unless params[:include_deleted] == "1"
        base_scope = base_scope.where(is_unlisted: false) if params[:hide_unlisted] == "1"
        base_scope = base_scope.where("EXISTS (SELECT 1 FROM journal_entries WHERE journal_entries.project_id = projects.id AND journal_entries.discarded_at IS NULL)") if params[:with_journals] == "1"
        search_scope = base_scope
        search_scope = search_scope.search_for(params[:query]) if params[:query].present?
        pagy_obj, projects = pagy(search_scope.order(created_at: :desc))
        project_ids = projects.map(&:id)
        @entry_counts = JournalEntry.where(project_id: project_ids, discarded_at: nil).group(:project_id).count
        @last_entries = JournalEntry.where(project_id: project_ids, discarded_at: nil).group(:project_id).maximum(:created_at)
        @hours_tracked = Project.batch_time_logged(project_ids)

        {
          projects: projects.map { |p| serialize_project_row(p) },
          pagy: pagy_props(pagy_obj),
          total_count: base_scope.count
        }
      },
      query: params[:query].to_s,
      include_deleted: params[:include_deleted] == "1",
      hide_unlisted: params[:hide_unlisted] == "1",
      with_journals: params[:with_journals] == "1"
    }
    props[:audit_log] = InertiaRails.defer { serialize_audit_log(@user) } if current_user.admin? # Audit log — admin-only
    render inertia: props
  end

  def update_roles
    @user = User.find(params[:id])
    authorize @user

    roles = Array(params[:roles]).map(&:to_s) & User::VALID_ROLES
    # Preserve the user role — it's not editable through this endpoint
    roles |= [ "user" ] if @user.has_role?(:user)
    roles -= [ "user" ] unless @user.has_role?(:user)

    # Admins cannot remove the admin role from themselves
    if @user == current_user && @user.admin? && roles.exclude?("admin")
      redirect_to admin_user_path(@user), alert: "You cannot remove the admin role from yourself."
      return
    end

    @user.update!(roles: roles)
    redirect_to admin_user_path(@user), notice: "Roles updated."
  end

  private

  def serialize_user_row(user)
    row = {
      id: user.id,
      display_name: user.display_name,
      slack_id: user.slack_id,
      roles: user.roles,
      projects_count: @projects_counts[user.id] || 0,
      is_discarded: user.discarded?,
      created_at: user.created_at.strftime("%b %d, %Y")
    }
    row[:email] = user.email if current_user.admin? # PII — admin-only
    row
  end

  def serialize_user_detail(user)
    detail = {
      id: user.id,
      display_name: user.display_name,
      avatar: user.avatar,
      slack_id: user.slack_id,
      roles: user.roles,
      projects_count: @projects_count,
      timezone: user.timezone,
      is_banned: user.is_banned,
      is_discarded: user.discarded?,
      discarded_at: user.discarded_at&.strftime("%b %d, %Y"),
      created_at: user.created_at.strftime("%b %d, %Y")
    }
    detail[:email] = user.email if current_user.admin? # PII — admin-only
    detail
  end

  def serialize_project_row(project)
    {
      id: project.id,
      name: project.name,
      user_id: project.user_id,
      user_display_name: @user.display_name,
      journal_entries_count: @entry_counts[project.id] || 0,
      repo_link: project.repo_link,
      hours_tracked: ((@hours_tracked[project.id] || 0) / 3600.0).round(1),
      last_entry_at: @last_entries[project.id]&.strftime("%b %d, %Y"),
      is_unlisted: project.is_unlisted,
      is_discarded: project.discarded?,
      created_at: project.created_at.strftime("%b %d, %Y")
    }
  end
end
