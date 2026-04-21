class JournalEntriesController < ApplicationController
  allow_trial_access only: %i[preview] # Trial users have unverified emails — block journal creation to prevent abuse
  skip_after_action :verify_authorized # No index action — blanket skip required (Rails 8.1 callback validation)
  skip_after_action :verify_policy_scoped # No index action — blanket skip required (Rails 8.1 callback validation)

  def new
    projects = Project.kept.where(user: current_user)
    if collaborators_enabled?
      collaborated_project_ids = Collaborator.kept.where(user: current_user, collaboratable_type: "Project").select(:collaboratable_id)
      projects = projects.or(Project.kept.where(id: collaborated_project_ids))
    end
    projects = projects.includes(:collaborator_users, :user) if collaborators_enabled?

    if params[:project_id]
      @project = projects.find(params[:project_id])
      authorize @project, :show? # User must own or have access to the project
    else
      skip_authorization # No specific project to authorize against
    end

    lapse_connected = current_user.lapse_token.present? || ENV["LAPSE_PROGRAM_KEY"].present?

    streak_data = streak_data_for_warning(current_user)

    render inertia: "journal_entries/new", props: {
      projects: projects.map { |p| serialize_project_for_journal(p) },
      selected_project_id: @project&.id,
      lapse_connected: lapse_connected,
      is_modal: request.headers["X-InertiaUI-Modal"].present?,
      direct_upload_url: rails_direct_uploads_url,
      streak_seconds_logged: streak_data[:seconds_logged],
      streak_threshold: streak_data[:threshold],
      lookout_timelapses: InertiaRails.defer {
        tokens = current_user.pending_lookout_tokens
        if tokens.any?
          sessions = LookoutService.batch_sessions(tokens) || []
          sessions
            .select { |s| %w[complete stopped].include?(s["status"]) && s["videoUrl"].present? }
            .map { |s| { token: s["token"], name: s["name"], status: s["status"], duration: s["trackedSeconds"], thumbnail_url: s["thumbnailUrl"], created_at: s["createdAt"] } }
        else
          []
        end
      },
      timelapses: InertiaRails.defer {
        if lapse_connected
          # Exclude timelapses already claimed by any journal via recordings
          claimed_ids = Recording.where(recordable_type: "LapseTimelapse")
            .joins("JOIN lapse_timelapses ON lapse_timelapses.id = recordings.recordable_id")
            .where(lapse_timelapses: { user_id: current_user.id })
            .pluck("lapse_timelapses.lapse_timelapse_id").to_set
          current_user.get_timelapses.reject { |t| claimed_ids.include?(t["id"]) }.map { |t| safe_timelapse_attrs(t) }
        else
          []
        end
      }
    }
  end

  def preview
    skip_authorization # No resource to authorize — just rendering markdown
    html = helpers.render_user_markdown(params[:content].to_s)
    render json: { html: html }
  end

  def create
    @project = Project.kept.find(params[:project_id]) # Pundit enforces access via JournalEntryPolicy#create?
    @journal_entry = @project.journal_entries.build(user: current_user, content: params[:content])
    authorize @journal_entry

    timelapse_ids = Array(params[:timelapse_ids]).map(&:to_s).uniq
    youtube_video_ids = Array(params[:youtube_video_ids]).map(&:to_i).uniq
    lookout_tokens = Array(params[:lookout_tokens]).map(&:to_s).uniq
    collaborator_ids = Array(params[:collaborator_ids]).map(&:to_i).uniq

    ActiveRecord::Base.transaction do
      @journal_entry.save!

      Array(params[:images]).each { |signed_id| @journal_entry.images.attach(signed_id) }

      timelapse_ids.each do |tid|
        timelapse = current_user.lapse_timelapses.create!(lapse_timelapse_id: tid)
        timelapse.refetch_data! # Fetches from Lapse API to verify and populate cached fields
        @journal_entry.recordings.create!(recordable: timelapse, user: current_user)
      end

      youtube_video_ids.each do |vid|
        video = YouTubeVideo.find(vid)
        @journal_entry.recordings.create!(recordable: video, user: current_user)
      end

      lookout_tokens.each do |token|
        raise ActiveRecord::RecordNotFound, "Token not in pending list" unless current_user.pending_lookout_tokens.include?(token)

        lookout = current_user.lookout_timelapses.create!(session_token: token)
        lookout.refetch_data!
        @journal_entry.recordings.create!(recordable: lookout, user: current_user)

        current_user.update!(pending_lookout_tokens: current_user.pending_lookout_tokens - [ token ])
      end

      # Add journal entry collaborators — only project participants (owner + collaborators) minus the creator
      if collaborators_enabled?
        collaborator_ids.each do |uid|
          collab_user = User.verified.kept.find_by(id: uid)
          next unless collab_user && collab_user.id != current_user.id
          next unless @project.owner_or_collaborator?(collab_user)
          @journal_entry.collaborators.create!(user: collab_user)
        end
      end
    end

    critter = maybe_award_critter(@journal_entry, current_user)
    award_critters_to_collaborators(@journal_entry)
    StreakService.record_activity(current_user)

    if current_user.journal_entries.kept.count == 1
      current_user.dialog_campaigns.find_or_create_by!(key: "first_journal") { |c| c.seen_at = nil }
    end

    if critter
      redirect_to critter_path(critter)
    else
      destination = params[:return_to] == "path" ? path_path : project_path(@project)
      redirect_to destination, notice: "Journal created."
    end
  end

  def destroy
    @journal_entry = JournalEntry.kept.find(params[:id])
    authorize @journal_entry

    source_project = @journal_entry.project
    @journal_entry.discard

    if modal_json_request?
      head :no_content
    else
      redirect_to project_path(source_project), notice: "Journal entry deleted."
    end
  end

  def switch_project
    @journal_entry = JournalEntry.kept.includes(:project).find(params[:id])
    authorize @journal_entry, :switch_project?

    new_project = Project.kept.find(params[:project_id])
    authorize JournalEntry.new(user: current_user, project: new_project), :create? # Re-check project access for the destination project

    source_project = @journal_entry.project
    if source_project.ships.approved.exists? || new_project.ships.approved.exists?
      return render_switch_project_error("Cannot move a journal entry from or to an approved project.")
    end

    if @journal_entry.update(project: new_project)
      if modal_json_request?
        head :no_content
      else
        redirect_to project_path(source_project), notice: "Journal moved."
      end
    else
      render_switch_project_error(@journal_entry.errors.full_messages.to_sentence)
    end
  end

  private

  def maybe_award_critter(journal_entry, user)
    return nil unless user.can_earn_critter?

    user.critters.create!(variant: Critter.roll_variant, journal_entry: journal_entry)
  end

  def award_critters_to_collaborators(journal_entry)
    journal_entry.collaborator_users.each do |collab_user|
      maybe_award_critter(journal_entry, collab_user)
    end
  end

  # Strip owner PII and internal fields before exposing to frontend
  def safe_timelapse_attrs(timelapse)
    timelapse.slice("id", "name", "thumbnailUrl", "playbackUrl", "duration", "createdAt")
  end

  def serialize_project_for_journal(project)
    potential = if collaborators_enabled?
      ([ project.user ] + project.collaborator_users.to_a)
        .reject { |u| u.id == current_user.id }
        .map { |u| { id: u.id, display_name: u.display_name, avatar: u.avatar } }
    else
      []
    end

    { id: project.id, name: project.name, potential_collaborators: potential }
  end

  def streak_data_for_warning(user)
    if user.trial?
      { seconds_logged: nil, threshold: nil }
    else
      today = Time.current.in_time_zone(user.timezone).to_date
      streak_day = StreakDay.find_by(user: user, date: today)
      if streak_day&.status_active?
        { seconds_logged: nil, threshold: nil } # Already hit the threshold — no warning needed
      else
        { seconds_logged: StreakService.daily_seconds_logged(user, today), threshold: StreakService::STREAK_THRESHOLD_SECONDS }
      end
    end
  end

  def render_switch_project_error(message)
    if modal_json_request? || request.headers["X-Inertia"].present?
      render json: { errors: { base: [ message ] } }, status: :unprocessable_entity
    else
      redirect_back fallback_location: projects_path, inertia: { errors: { base: [ message ] } }
    end
  end

  def modal_json_request?
    request.format.json? || request.headers["X-InertiaUI-Modal"].present?
  end
end
