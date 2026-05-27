class ProjectsController < ApplicationController
  allow_unauthenticated_access only: %i[show] # Listed project details are public from Explore and the public API.
  allow_trial_access only: %i[index show new create edit update destroy onboarding export_journal] # Trial users can manage their single project and export their journal
  skip_onboarding_redirect only: %i[show] # Public project details must stay viewable before account onboarding.
  before_action :set_project, only: %i[show edit update destroy export_journal]
  before_action :set_project_unfurl_meta, only: :show

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
    scope = scope.includes(kept_journal_entries: { images_attachments: :blob }, unified_thumbnail_attachment: :blob)
    scope = scope.search(params[:query]) if params[:query].present?
    @pagy, @projects = pagy(scope.order(created_at: :desc))
    project_ids = @projects.map(&:id)
    @recordings_counts = Recording.joins(:journal_entry)
      .where(journal_entries: { project_id: project_ids, discarded_at: nil })
      .group("journal_entries.project_id").count
    @time_logged_by_project = Project.batch_time_logged(project_ids)
    @user_time_logged_by_project = Project.batch_user_logged_seconds(project_ids, current_user)

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

    # Direct browser visits get the bulletin board with the project opened as a modal.
    # Inertia navigations and modal requests render the page normally.
    unless request.headers["X-Inertia"].present? || request.headers["X-InertiaUI-Modal"].present? || slack_unfurl_request?
      return redirect_to bulletin_board_path(project: @project.id), allow_other_host: false
    end

    journal_entries = @project.journal_entries.kept
      .includes(:user, :collaborator_users, { recordings: :recordable }, images_attachments: :blob)
      .order(created_at: :desc)
      .to_a

    collab_enabled = collaborators_enabled?
    project_policy = policy(@project)
    highlighted_journal_entry_id = highlighted_journal_entry_id(journal_entries)

    # Batch the per-entry markdown cache lookups into one fetch_multi so we
    # don't issue a cache GET per journal entry (was an N+1 against the cache backend).
    base_url = MarkdownHelper.canonical_base_url || (request.base_url rescue nil)
    entry_by_cache_key = journal_entries.index_by { |je| [ "journal_entry_html_v1", je.cache_key_with_version, base_url ] }
    html_by_cache_key = Rails.cache.fetch_multi(*entry_by_cache_key.keys) do |key|
      helpers.render_user_markdown(entry_by_cache_key[key].content.to_s)
    end
    content_html_by_id = entry_by_cache_key.each_with_object({}) { |(key, entry), h| h[entry.id] = html_by_cache_key[key] }

    journal_entry_ids = journal_entries.map(&:id)
    @journal_seconds_by_je = JournalEntry.batch_time_logged(journal_entry_ids)
    @user_journal_seconds_by_je = current_user ? JournalEntry.batch_user_attributed_seconds(journal_entry_ids, current_user) : {}

    render inertia: {
      project: serialize_project_detail(@project, journal_entries.size),
      journal_entries: journal_entries.map { |je| serialize_journal_entry_card(je, content_html_by_id[je.id]) },
      switchable_projects_for_journal: switchable_projects_for_journal,
      collaborators: @project.collaborators.includes(:user).map { |c| serialize_project_collaborator(c) },
      ships: @project.ships.includes(time_audit_review: :reviewer, requirements_check_review: :reviewer, design_review: :reviewer, build_review: :reviewer).order(created_at: :desc).map { |s|
        { id: s.id, status: s.status, feedback: s.feedback, created_at_iso: s.created_at.iso8601, updated_at_iso: s.updated_at.iso8601, reviewer_display_name: s.returning_reviewer&.display_name, time_audit_status: s.time_audit_review&.status, requirements_check_status: s.requirements_check_review&.status, design_review_status: s.design_review&.status }
      },
      can: {
        update: project_policy.update?,
        destroy: project_policy.destroy?,
        export_journal: project_policy.export_journal?,
        share: project_policy.share?, # Gates the "Copy share link" overflow menu item — true only for listed, non-discarded projects
        ship: project_policy.ship?,
        manage_collaborators: collab_enabled && project_policy.manage_collaborators?,
        # JournalEntriesController only allows trial access on :preview — exclude trial users so they fall through to the locked button below.
        create_journal_entry: !current_user&.trial? && JournalEntryPolicy.new(current_user, @project.journal_entries.build(user: current_user)).create?,
        # Trial owner or trial collaborator who would gain create access on verifying — drives the "locked" feather button with a verify prompt.
        # Strangers (incl. unauthenticated visitors on the public project page) get false and see no button.
        create_journal_entry_locked_for_trial: current_user&.trial? && (@project.user_id == current_user.id || (collab_enabled && @project.collaborator?(current_user)))
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
      project: { name: "", description: "", repo_link: "", built_irl: false, demo_video_link: "" },
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
        repo_link: @project.repo_link.to_s,
        built_irl: @project.built_irl?,
        demo_video_link: @project.demo_video_link.to_s
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

  def export_journal
    authorize @project, :export_journal?

    journal_entries = @project.journal_entries.kept
      .includes(:user, recordings: :recordable)
      .order(created_at: :asc)

    markdown = build_journal_export_markdown(@project, journal_entries)

    send_data markdown,
              filename: "#{@project.name.to_s.parameterize.presence || "project"}-journal.md",
              type: "text/markdown; charset=utf-8",
              disposition: "attachment"
  end

  private

  def set_project
    scope = Project.kept
    scope = scope.includes(:user, unified_thumbnail_attachment: :blob) if action_name == "show"
    @project = scope.find(params[:id])
  end

  def project_params
    params.expect(project: [ :name, :description, :repo_link, :built_irl, :demo_video_link ])
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
      cover_image_url: if project.unified_thumbnail.attached?
                         url_for(project.unified_thumbnail)
                       else
                         cover_entry&.images&.first&.then { |img| url_for(img) }
                       end,
      journal_entries_count: kept_entries.size,
      time_logged: @time_logged_by_project[project.id] || 0,
      user_time_logged: @user_time_logged_by_project[project.id] || 0,
      recordings_count: @recordings_counts[project.id] || 0,
      is_collaborator: project.user_id != current_user.id # True when viewing a project you collaborate on (not own)
    }
  end

  def serialize_project_detail(project, journal_entries_count)
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
      # Only expose the viewer's attributed share when they actually belong to the project
      # — public viewers on a listed project shouldn't see a "0h yours" hint that just
      # reveals they aren't a member.
      user_time_logged: current_user && project.owner_or_collaborator?(current_user) ? project.user_logged_seconds(current_user) : nil,
      journal_entries_count: journal_entries_count,
      unified_thumbnail_url: project.unified_thumbnail.attached? ? url_for(project.unified_thumbnail) : nil
    }
  end

  def serialize_journal_entry_card(journal_entry, content_html)
    content = journal_entry.content.to_s
    is_blueprint_transfer = content.start_with?("Project transferred from Blueprint!")
    hours_match = content.match(/Duration Transferred: ([\d.]+)h/)
    {
      id: journal_entry.id,
      content_html: content_html,
      is_blueprint_transfer: is_blueprint_transfer,
      blueprint_hours: hours_match ? hours_match[1].to_f : nil,
      images: journal_entry.images.map { |img| url_for(img) },
      recordings_count: policy(journal_entry).show? ? journal_entry.recordings.size : 0, # Only expose recording count to entry author/owner/collaborator
      recordings: policy(journal_entry).show? ? journal_entry.recordings.filter_map { |recording| serialize_journal_recording(recording) } : [], # Only expose recordings to entry author/owner/collaborator
      created_at: journal_entry.created_at.strftime("%B %d, %Y"),
      created_at_iso: journal_entry.created_at.iso8601,
      author_display_name: journal_entry.user.display_name,
      author_avatar: journal_entry.user.avatar,
      time_logged: @journal_seconds_by_je[journal_entry.id].to_i,
      # Null when the viewer isn't in the journal's attribution set (e.g. signed-out / not
      # a member). Frontend hides the bracket in that case rather than showing "0h yours".
      user_time_logged: @user_journal_seconds_by_je[journal_entry.id],
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

  def build_journal_export_markdown(project, journal_entries)
    lines = []
    lines << "# #{project.name} — Journal Export"
    lines << ""
    lines << "- Exported at: #{Time.current.utc.iso8601}"
    lines << "- Project ID: #{project.id}"
    lines << "- Entries: #{journal_entries.size}"
    lines << ""

    journal_entries.each_with_index do |entry, idx|
      lines << "## Entry #{idx + 1}"
      lines << "- ID: #{entry.id}"
      lines << "- Author: #{entry.user.display_name}"
      lines << "- Created At: #{entry.created_at.utc.iso8601}"
      lines << ""
      lines << "### Content"
      lines << ""
      lines << (entry.content.presence || "(no content)")
      lines << ""

      recording_links = export_recording_links(entry)
      if recording_links.any?
        lines << "### Recording Links"
        lines << ""
        recording_links.each { |link| lines << "- #{link}" }
        lines << ""
      end
    end

    lines.join("\n")
  end

  def export_recording_links(entry)
    entry.recordings.filter_map do |recording|
      recordable = recording.recordable

      case recordable
      when YouTubeVideo
        recordable.youtube_url.presence
      when LapseTimelapse, LookoutTimelapse
        recordable.playback_url.presence
      else
        nil
      end
    end
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

  def set_project_unfurl_meta
    return unless action_name == "show"
    return if request.headers["X-Inertia"].present? || request.headers["X-InertiaUI-Modal"].present?

    cover_entry = JournalEntry.public_for_explore
      .where(project_id: @project.id)
      .joins(:images_attachments)
      .order(created_at: :desc)
      .first

    @unfurl_meta = {
      title: @project.name,
      description: @project.description.to_s.truncate(200).presence || "View this Fallout project.",
      image: cover_entry&.images&.first&.then { |img| url_for(img) },
      url: project_url(@project)
    }
  end

  def slack_unfurl_request?
    request.user_agent.to_s.include?("Slackbot")
  end
end
