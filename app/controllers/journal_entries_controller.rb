class JournalEntriesController < ApplicationController
  allow_trial_access only: %i[preview] # Trial users have unverified emails — block journal creation to prevent abuse
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

    lapse_connected = current_user.lapse_token.present? || ENV["LAPSE_PROGRAM_KEY"].present?

    render inertia: "journal_entries/new", props: {
      projects: projects.map { |p| { id: p.id, name: p.name } },
      selected_project_id: @project&.id,
      lapse_connected: lapse_connected,
      is_modal: request.headers["X-InertiaUI-Modal"].present?,
      direct_upload_url: rails_direct_uploads_url,
      collapse_timelapses: InertiaRails.defer {
        if Flipper.enabled?(:"03_18_collapse", current_user)
          claimed_ids = Recording.where(recordable_type: "CollapseTimelapse").pluck(:recordable_id).to_set
          unclaimed = current_user.collapse_timelapses.where.not(id: claimed_ids)

          # Batch-refresh all unclaimed sessions from Collapse API so status/metadata stays current
          tokens = unclaimed.pluck(:session_token)
          if tokens.any?
            sessions = CollapseService.batch_sessions(tokens)
            if sessions.present?
              sessions_by_token = sessions.index_by { |s| s["token"] }
              unclaimed.find_each do |c|
                data = sessions_by_token[c.session_token]
                next unless data
                c.update(
                  name: data["name"].presence || c.name,
                  status: data["status"],
                  tracked_seconds: data["trackedSeconds"],
                  screenshot_count: data["screenshotCount"],
                  video_url: data["videoUrl"],
                  thumbnail_url: data["thumbnailUrl"],
                  last_refreshed_at: Time.current
                )
              end
            end
          end

          unclaimed.where(status: %w[complete stopped])
            .order(created_at: :desc)
            .map { |c| { id: c.id, name: c.name, status: c.status, tracked_seconds: c.tracked_seconds, thumbnail_url: c.thumbnail_url, created_at: c.created_at.iso8601 } }
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
    @project = current_user.projects.kept.find(params[:project_id])
    @journal_entry = @project.journal_entries.build(user: current_user, content: params[:content])
    authorize @journal_entry

    timelapse_ids = Array(params[:timelapse_ids]).map(&:to_s).uniq
    youtube_video_ids = Array(params[:youtube_video_ids]).map(&:to_i).uniq
    collapse_timelapse_ids = Array(params[:collapse_timelapse_ids]).map(&:to_i).uniq

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

      collapse_timelapse_ids.each do |cid|
        collapse = current_user.collapse_timelapses.find(cid)
        collapse.refetch_data! # Fetches from Collapse API to verify and populate cached fields
        @journal_entry.recordings.create!(recordable: collapse, user: current_user)
      end
    end

    # Redirect to path when created from the journal modal so it closes and the path updates
    destination = params[:return_to] == "path" ? path_path : project_path(@project)
    redirect_to destination, notice: "Journal created."
  end

  private

  # Strip owner PII and internal fields before exposing to frontend
  def safe_timelapse_attrs(timelapse)
    timelapse.slice("id", "name", "thumbnailUrl", "playbackUrl", "duration", "createdAt")
  end
end
