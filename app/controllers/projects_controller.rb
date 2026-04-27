class ProjectsController < ApplicationController
  allow_unauthenticated_access only: %i[show] # Listed project details are public from Explore and the public API.
  allow_trial_access only: %i[index show new create edit update destroy onboarding] # Trial users can manage their single project
  skip_onboarding_redirect only: %i[show] # Public project details must stay viewable before account onboarding.
  before_action :set_project, only: %i[show edit update destroy]

  def onboarding
    authorize :project, :onboarding? # Policy gate for project onboarding access

    render inertia: "projects/onboarding/index", props: {
      is_modal: request.headers["X-InertiaUI-Modal"].present?
    }
  end

  def index
    scope = policy_scope(Project).kept.where(user: current_user)
    if collaborators_enabled?
      collaborated_ids = Collaborator.kept.where(user: current_user, collaboratable_type: "Project").select(:collaboratable_id)
      scope = scope.or(Project.kept.where(id: collaborated_ids))
    end
    scope = scope.includes(kept_journal_entries: :images_attachments)
    scope = scope.search(params[:query]) if params[:query].present?
    @pagy, @projects = pagy(scope.order(created_at: :desc))
    @recordings_counts = Recording.joins(:journal_entry)
      .where(journal_entries: { project_id: @projects.map(&:id), discarded_at: nil })
      .group("journal_entries.project_id").count

    render inertia: {
      projects: @projects.map { |p| serialize_project_card(p) },
      pagy: pagy_props(@pagy),
      query: params[:query].to_s,
      # Independent of the search filter — drives whether "New Project" runs the onboarding flow
      has_any_project: current_user.projects.kept.exists? ||
        (collaborators_enabled? && Collaborator.kept.where(user: current_user, collaboratable_type: "Project").exists?),
      can_create_project: policy(Project.new(user: current_user)).create?,
      is_modal: request.headers["X-InertiaUI-Modal"].present?
    }
  end

  def show
    authorize @project

    journal_entries = @project.journal_entries.kept
      .includes(:user, :collaborator_users, { recordings: :recordable }, images_attachments: :blob)
      .order(created_at: :desc)
      .to_a

    collab_enabled = collaborators_enabled?
    project_policy = policy(@project)
    highlighted_journal_entry_id = highlighted_journal_entry_id(journal_entries)

    render inertia: {
      project: serialize_project_detail(@project),
      journal_entries: journal_entries.map { |je| serialize_journal_entry_card(je) },
      switchable_projects_for_journal: switchable_projects_for_journal,
      collaborators: @project.collaborators.includes(:user).map { |c| serialize_project_collaborator(c) },
      ships: @project.ships.order(created_at: :desc).map { |s|
        { id: s.id, status: s.status, feedback: s.feedback, created_at_iso: s.created_at.iso8601, updated_at_iso: s.updated_at.iso8601 }
      },
      can: {
        update: project_policy.update?,
        destroy: project_policy.destroy?,
        ship: project_policy.ship?,
        manage_collaborators: collab_enabled && project_policy.manage_collaborators?,
        create_journal_entry: JournalEntryPolicy.new(current_user, @project.journal_entries.build(user: current_user)).create?,
        # Trial collaborator who would gain create access on verifying — drives the "locked" feather button.
        # Owners are already allowed to create regardless of trial state, so they fall under create_journal_entry.
        # Strangers (incl. unauthenticated visitors on the public project page) get false and see no button.
        create_journal_entry_locked_for_trial: current_user&.trial? && collab_enabled && @project.collaborator?(current_user)
      },
      initial_tab: highlighted_journal_entry_id ? "journal" : "timeline",
      highlight_journal_entry_id: highlighted_journal_entry_id,
      is_modal: request.headers["X-InertiaUI-Modal"].present?
    }
  end

  def new
    @project = current_user.projects.build
    authorize @project

    render inertia: "projects/form", props: {
      project: { name: "", description: "", repo_link: "" },
      title: "New Project",
      submit_url: projects_path,
      method: "post",
      is_modal: request.headers["X-InertiaUI-Modal"].present?
    }
  end

  def create
    @project = current_user.projects.build(project_params)
    authorize @project

    if @project.save
      if request.headers["X-InertiaUI-Modal"].present? && params[:return_to] != "path"
        head :no_content
      else
        # Onboarding flows land on /path and let the frontend finish the handoff before opening any modal
        destination = case params[:return_to]
        when "path"
          path_path
        when "path_projects"
          path_path
        else
          projects_path
        end
        redirect_to destination, notice: "Project created."
      end
    else
      if request.headers["X-InertiaUI-Modal"].present? && params[:return_to] != "path"
        render json: { errors: @project.errors.messages }, status: :unprocessable_entity
      else
        redirect_back fallback_location: new_project_path, inertia: { errors: @project.errors.messages }
      end
    end
  end

  def edit
    authorize @project

    render inertia: "projects/form", props: {
      project: {
        id: @project.id,
        name: @project.name,
        description: @project.description.to_s,
        repo_link: @project.repo_link.to_s
      },
      title: "Edit Project",
      submit_url: project_path(@project),
      method: "patch",
      is_modal: request.headers["X-InertiaUI-Modal"].present?
    }
  end

  def update
    authorize @project

    if @project.update(project_params)
      if request.headers["X-InertiaUI-Modal"].present?
        head :no_content
      else
        redirect_to @project, notice: "Project updated."
      end
    else
      if request.headers["X-InertiaUI-Modal"].present?
        render json: { errors: @project.errors.messages }, status: :unprocessable_entity
      else
        redirect_back fallback_location: edit_project_path(@project), inertia: { errors: @project.errors.messages }
      end
    end
  end

  def destroy
    authorize @project

    if @project.discard
      if request.headers["X-InertiaUI-Modal"].present?
        head :no_content
      else
        redirect_to projects_path, notice: "Project deleted."
      end
    else
      if request.headers["X-InertiaUI-Modal"].present?
        render json: { errors: @project.errors.messages }, status: :unprocessable_entity
      else
        redirect_back fallback_location: project_path(@project), inertia: { errors: @project.errors.messages }
      end
    end
  end

  private

  def set_project
    scope = Project.kept
    scope = scope.includes(:user) if action_name == "show"
    @project = scope.find(params[:id])
  end

  def project_params
    params.expect(project: [ :name, :description, :repo_link ])
  end

  def serialize_project_card(project)
    kept_entries = project.kept_journal_entries
    cover_entry = kept_entries.select { |je| je.images.any? }.max_by(&:created_at)
    {
      id: project.id,
      name: project.name,
      description: project.description&.truncate(200),
      is_unlisted: project.is_unlisted,
      tags: project.tags,
      cover_image_url: cover_entry&.images&.first&.then { |img| url_for(img) },
      journal_entries_count: kept_entries.size,
      time_logged: project.time_logged,
      recordings_count: @recordings_counts[project.id] || 0,
      is_collaborator: project.user_id != current_user.id # True when viewing a project you collaborate on (not own)
    }
  end

  def serialize_project_detail(project)
    {
      id: project.id,
      name: project.name,
      description: project.description,
      demo_link: project.demo_link,
      repo_link: project.repo_link,
      is_unlisted: project.is_unlisted,
      tags: project.tags,
      user_display_name: project.user.display_name,
      user_avatar: project.user.avatar,
      created_at: project.created_at.strftime("%B %d, %Y"),
      created_at_iso: project.created_at.iso8601,
      time_logged: project.time_logged,
      journal_entries_count: project.kept_journal_entries.count
    }
  end

  def serialize_journal_entry_card(journal_entry)
    {
      id: journal_entry.id,
      content_html: helpers.render_user_markdown(journal_entry.content.to_s),
      images: journal_entry.images.map { |img| url_for(img) },
      recordings_count: journal_entry.recordings.size,
      recordings: journal_entry.recordings.filter_map { |recording| serialize_journal_recording(recording) },
      created_at: journal_entry.created_at.strftime("%B %d, %Y"),
      created_at_iso: journal_entry.created_at.iso8601,
      author_display_name: journal_entry.user.display_name,
      author_avatar: journal_entry.user.avatar,
      time_logged: journal_entry.recordings.sum { |r|
        if r.recordable.is_a?(YouTubeVideo)
          r.recordable.duration_seconds.to_i * (r.recordable.stretch_multiplier || 1)
        else
          r.recordable.respond_to?(:duration_seconds) ? r.recordable.duration_seconds.to_i : r.recordable.duration.to_i
        end
      },
      collaborators: journal_entry.collaborator_users.map { |u| { display_name: u.display_name, avatar: u.avatar } },
      can_switch_project: policy(journal_entry).switch_project?,
      can_delete: policy(journal_entry).destroy?
    }
  end

  def serialize_journal_recording(recording)
    recordable = recording.recordable
    return unless recordable.is_a?(YouTubeVideo)

    {
      id: recording.id,
      type: "youtube",
      title: recordable.title.presence || "YouTube recording",
      thumbnail_url: recordable.thumbnail_url.presence || recordable.thumbnail_url_for(quality: "hqdefault"),
      embed_url: "https://www.youtube-nocookie.com/embed/#{recordable.video_id}"
    }
  end

  def serialize_project_collaborator(collaborator)
    data = {
      display_name: collaborator.user.display_name,
      avatar: collaborator.user.avatar
    }

    if policy(@project).manage_collaborators?
      data[:id] = collaborator.id
      data[:user_id] = collaborator.user.id
    end

    data
  end

  def highlighted_journal_entry_id(journal_entries)
    requested_id = params[:journal_entry_id].presence&.to_i
    return nil unless requested_id
    return requested_id if journal_entries.any? { |entry| entry.id == requested_id }

    nil
  end

  def switchable_projects_for_journal
    return [] unless current_user

    scope = Project.kept.where(user: current_user)
    if collaborators_enabled?
      collaborated_ids = Collaborator.kept.where(user: current_user, collaboratable_type: "Project").select(:collaboratable_id)
      scope = scope.or(Project.kept.where(id: collaborated_ids))
      scope = scope.includes(:collaborator_users)
    end

    unshipped_ids = Project.kept
      .where(id: scope)
      .where.not(id: Ship.approved.select(:project_id))
      .pluck(:id)
      .to_set

    scope.select { |project|
      next false unless unshipped_ids.include?(project.id)
      JournalEntryPolicy.new(current_user, project.journal_entries.build(user: current_user)).create?
    }.map { |project| { id: project.id, name: project.name } }
  end
end
