class JournalEntriesController < ApplicationController
  allow_trial_access only: %i[new create preview] # Trial users can access journal creation and preview
  skip_after_action :verify_authorized # No index action — blanket skip required (Rails 8.1 callback validation)
  skip_after_action :verify_policy_scoped # No index action — blanket skip required (Rails 8.1 callback validation)

  def new
    projects = current_user.projects.kept

    if params[:project_id]
      @project = projects.find(params[:project_id])
      authorize @project, :show? # User must own or have access to the project
    else
      skip_authorization # No specific project to authorize against
    end

    lapse_connected = current_user.lapse_token.present?

    render inertia: "journal_entries/new", props: {
      projects: projects.map { |p| { id: p.id, name: p.name } },
      selected_project_id: @project&.id,
      lapse_connected: lapse_connected,
      is_modal: request.headers["X-InertiaUI-Modal"].present?,
      direct_upload_url: rails_direct_uploads_url,
      hackatime_projects: InertiaRails.defer { fetch_hackatime_projects_with_timelapses if lapse_connected }
    }
  end

  def preview
    skip_authorization # No resource to authorize — just rendering markdown
    html = helpers.render_user_markdown(params[:content].to_s)
    render json: { html: html }
  end

  def create
    @project = current_user.projects.kept.find(params[:project_id])
    @journal_entry = @project.journal_entries.build(user: current_user, content: params[:content])
    authorize @journal_entry

    timelapse_ids = Array(params[:timelapse_ids]).map(&:to_s).uniq

    ActiveRecord::Base.transaction do
      @journal_entry.save!

      Array(params[:images]).each { |signed_id| @journal_entry.images.attach(signed_id) }

      timelapse_ids.each do |tid|
        timelapse = current_user.lapse_timelapses.create!(
          journal_entry: @journal_entry,
          lapse_timelapse_id: tid
        )
        timelapse.update_data! # Fetches from Lapse API to verify and populate cached fields
      end
    end

    redirect_to project_path(@project), notice: "Journal created."
  end

  private

  def fetch_hackatime_projects_with_timelapses
    token = current_user.lapse_token
    ht_projects = LapseService.hackatime_projects(token)
    return [] unless ht_projects

    ht_projects.filter_map do |project|
      name = project["name"]
      next unless name

      timelapses = LapseService.timelapses_for_project(token, name) || []
      {
        name: name,
        time: project["time"],
        timelapses: timelapses.map { |t| safe_timelapse_attrs(t) }
      }
    end
  end

  # Strip owner PII and internal fields before exposing to frontend
  def safe_timelapse_attrs(timelapse)
    timelapse.slice("id", "name", "thumbnailUrl", "playbackUrl", "duration", "createdAt")
  end
end
