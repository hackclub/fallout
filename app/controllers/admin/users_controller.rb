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
      # `hcb` is intentionally omitted — it can only be granted via the Rails console.
      valid_roles: current_user.admin? ? User::ADMIN_ASSIGNABLE_ROLES : [],
      is_self: @user == current_user,
      streak_data: InertiaRails.defer {
        streak_days = @user.streak_days.chronological.pluck(:date, :status)
        most_recent_broken = @user.streak_goals.discarded.order(discarded_at: :desc).first
        {
          current_streak: StreakDay.current_streak(@user),
          longest_streak: StreakDay.longest_streak(@user),
          total_active_days: @user.streak_days.status_active.count,
          freezes_remaining: @user.streak_freezes,
          days: streak_days.map { |date, status| { date: date.iso8601, status: status } },
          goals: @user.streak_goals.order(created_at: :desc).map do |g|
            {
              id: g.id,
              target_days: g.target_days,
              started_on: g.started_on.iso8601,
              progress: g.progress,
              completed: g.completed?,
              broken: g.discarded?,
              restorable: most_recent_broken&.id == g.id && @user.streak_goal.nil?
            }
          end
        }
      },
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
    # Inline (not deferred) so the warning banner is visible immediately on page load.
    # Cheap query: count unresolved warnings for this user.
    props[:project_grant_warnings_count] = if current_user.admin?
      ProjectGrantWarning.unresolved.where(user_id: @user.id).count
    else
      0
    end
    props[:hcb_grant_cards] = InertiaRails.defer { # Financial data — admin-only visibility
      cards = @user.hcb_grant_cards.order(created_at: :desc).to_a
      # Batch the net-transferred totals per card (in minus out). Single grouped query
      # so we don't N+1 one per card.
      transferred_by_card = ProjectFundingTopup.kept.where(
        hcb_grant_card_id: cards.map(&:id),
        status: "completed"
      ).group(:hcb_grant_card_id)
        .sum(Arel.sql("CASE direction WHEN 'out' THEN -amount_cents ELSE amount_cents END"))

      cards.map do |card|
        {
          id: card.id,
          hcb_id: card.hcb_id,
          status: card.status,
          purpose: card.purpose,
          expires_on: card.expires_on&.iso8601,
          amount_cents: card.amount_cents,
          balance_cents: card.balance_cents,
          transferred_in_cents: transferred_by_card[card.id] || 0,
          created_at: card.created_at.strftime("%b %d, %Y"),
          canceled_at: card.canceled_at&.strftime("%b %d, %Y"),
          last_synced_at: card.last_synced_at&.strftime("%b %d, %Y %H:%M")
        }
      end
    } if current_user.admin?
    props[:audit_log] = InertiaRails.defer { # Audit log — admin-only
      streak_day_ids = @user.streak_days.select(:id)
      streak_versions = PaperTrail::Version.where(item_type: "StreakDay", item_id: streak_day_ids).to_a
      # Include current and destroyed streak goals — find all goal IDs ever associated with this user
      streak_goal_item_ids = PaperTrail::Version.where(item_type: "StreakGoal", event: "create")
                                                .where("object_changes @> ?", { user_id: [ nil, @user.id ] }.to_json)
                                                .pluck(:item_id)
      streak_goal_item_ids << @user.streak_goal.id if @user.streak_goal # Include current goal even if created before paper_trail was added
      streak_goal_versions = streak_goal_item_ids.any? ? PaperTrail::Version.where(item_type: "StreakGoal", item_id: streak_goal_item_ids.uniq).to_a : []
      serialize_audit_log(@user, extra_versions: streak_versions + streak_goal_versions)
    } if current_user.admin?
    render inertia: props
  end

  def update_roles
    @user = User.find(params[:id])
    authorize @user

    # Intersect with admin-assignable only — this silently drops any `hcb` (or `user`)
    # values a malicious client might try to slip in.
    roles = Array(params[:roles]).map(&:to_s) & User::ADMIN_ASSIGNABLE_ROLES
    # Preserve structural `user` role exactly as it was — this endpoint doesn't manage it.
    roles |= [ "user" ] if @user.has_role?(:user)
    roles -= [ "user" ] unless @user.has_role?(:user)
    # Preserve `hcb` exactly as it was — only the Rails console may add or remove it.
    roles |= [ "hcb" ] if @user.has_role?(:hcb)
    roles -= [ "hcb" ] unless @user.has_role?(:hcb)

    # Admins cannot remove the admin role from themselves
    if @user == current_user && @user.admin? && roles.exclude?("admin")
      redirect_to admin_user_path(@user), alert: "You cannot remove the admin role from yourself."
      return
    end

    @user.update!(roles: roles)
    redirect_to admin_user_path(@user), notice: "Roles updated."
  end

  def update_ban
    @user = User.find(params[:id])
    authorize @user

    banning = ActiveModel::Type::Boolean.new.cast(params[:is_banned])

    if banning
      ban_type = params[:ban_type].to_s
      unless ban_type.in?(User::MANUAL_BAN_TYPES)
        redirect_to admin_user_path(@user), alert: "Invalid ban type. Must be one of: #{User::MANUAL_BAN_TYPES.join(', ')}."
        return
      end
      ban_reason = params[:ban_reason].to_s.strip
      if ban_reason.blank?
        redirect_to admin_user_path(@user), alert: "A reason is required when banning a user."
        return
      end
      @user.update!(is_banned: true, ban_type: ban_type, ban_reason: ban_reason)
      redirect_to admin_user_path(@user), notice: "#{@user.display_name} has been banned (#{ban_type})."
    else
      @user.update!(is_banned: false, ban_type: nil, ban_reason: nil)
      redirect_to admin_user_path(@user), notice: "#{@user.display_name} has been unbanned."
    end
  end

  def restore_streak_goal
    @user = User.find(params[:id])
    authorize @user

    # Only broken (discarded) goals can be restored — active goals are already in progress.
    goal = @user.streak_goals.discarded.order(discarded_at: :desc).first
    unless goal
      redirect_to admin_user_path(@user), alert: "No broken streak goal to restore."
      return
    end

    if @user.streak_goal.present?
      redirect_to admin_user_path(@user), alert: "User already has an active streak goal."
      return
    end

    goal.undiscard

    # Fill every day in the goal window with frozen if it has no active/frozen status.
    (0...goal.target_days).each do |offset|
      date = goal.started_on + offset.days
      day = StreakDay.find_or_initialize_by(user: @user, date: date)
      next if day.status_active? || day.status_frozen?

      day.status = :frozen
      day.save!
    end

    redirect_to admin_user_path(@user), notice: "Streak goal restored — blank and missed days set to frozen."
  end

  def update_streak_day
    @user = User.find(params[:id])
    authorize @user

    date = begin
      Date.parse(params[:date])
    rescue ArgumentError
      render json: { error: "Invalid date" }, status: :unprocessable_entity
      return
    end
    status = params[:status]

    unless StreakDay.statuses.key?(status)
      render json: { error: "Invalid status" }, status: :unprocessable_entity
      return
    end

    streak_day = StreakDay.find_or_initialize_by(user: @user, date: date)
    streak_day.status = status
    streak_day.save!

    render json: {
      date: date.iso8601,
      status: streak_day.status,
      current_streak: StreakDay.current_streak(@user),
      longest_streak: StreakDay.longest_streak(@user),
      total_active_days: @user.streak_days.status_active.count,
      freezes_remaining: @user.streak_freezes
    }
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
      ban_type: user.ban_type,
      ban_reason: user.ban_reason,
      is_discarded: user.discarded?,
      discarded_at: user.discarded_at&.strftime("%b %d, %Y"),
      created_at: user.created_at.strftime("%b %d, %Y")
    }
    if current_user.admin? # PII — admin-only
      detail[:email] = user.email
      detail[:pronouns] = user.pronouns
      detail[:bio] = user.bio
    end
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
