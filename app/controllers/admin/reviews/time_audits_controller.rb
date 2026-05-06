class Admin::Reviews::TimeAuditsController < Admin::Reviews::BaseController
  def index
    base = policy_scope(TimeAuditReview)
      .includes(ship: [ :project, :requirements_check_review, project: :user ], reviewer: [])

    pending_reviews = base.pending.where.not(ship_id: flagged_ship_ids).order(created_at: :asc).load
    @pagy, @all_reviews = pagy(base.order(created_at: :desc))
    flagged_ids = ProjectFlag.distinct.pluck(:project_id).to_set

    render inertia: {
      pending_reviews: pending_reviews.map { |r| serialize_review_row(r) },
      all_reviews: @all_reviews.map { |r| serialize_review_row(r, flagged_project_ids: flagged_ids) },
      pagy: pagy_props(@pagy),
      start_reviewing_path: next_admin_reviews_time_audits_path
    }
  end

  def show
    authorize @review

    ship = @review.ship
    project = ship.project

    new_entries = ship.new_journal_entries
      .includes(:user, :images_attachments, recordings: :recordable)
      .order(created_at: :asc)

    previous_entries = ship.previous_journal_entries
      .includes(:user, :images_attachments, recordings: :recordable)
      .order(created_at: :asc)

    render inertia: {
      review: serialize_review_detail(@review),
      ship: serialize_ship_context(ship),
      project: serialize_project_context(project),
      new_entries: new_entries.map { |je| serialize_journal_entry(je) },
      previous_entries: previous_entries.map { |je| serialize_journal_entry(je) },
      sibling_statuses: serialize_sibling_statuses(ship),
      reviewer_notes: InertiaRails.defer { serialize_reviewer_notes(project) },
      reviewer_notes_path: admin_project_reviewer_notes_path(project),
      project_flagged: project.flagged?,
      can: { update: policy(@review).update? },
      skip: params[:skip],
      heartbeat_path: heartbeat_admin_reviews_time_audit_path(@review),
      next_path: next_admin_reviews_time_audits_path,
      index_path: admin_reviews_time_audits_path
    }
  end

  def update
    authorize @review

    if @review.update(stamp_annotation_reviewer(review_params))
      respond_to do |format|
        format.json { render json: { ok: true } }
        format.html do
          if @review.approved? || @review.returned? || @review.rejected?
            redirect_to_next_or_index(notice: "Time audit #{@review.status}.")
          else
            redirect_to admin_reviews_time_audit_path(@review, skip: params[:skip]), notice: "Time audit updated."
          end
        end
      end
    else
      respond_to do |format|
        format.json { render json: { errors: @review.errors.messages }, status: :unprocessable_entity }
        format.html do
          redirect_back fallback_location: admin_reviews_time_audit_path(@review),
                        inertia: { errors: @review.errors.messages }
        end
      end
    end
  end

  private

  def review_model
    TimeAuditReview
  end

  # Time audit frontend handles stretch_multiplier itself — keep raw video duration here to avoid double-counting
  def recording_duration(recording)
    case recording.recordable
    when LookoutTimelapse, LapseTimelapse then recording.recordable.duration.to_i
    when YouTubeVideo then recording.recordable.duration_seconds.to_i
    else 0
    end
  end

  def review_params
    permitted = params.require(:time_audit_review).permit(:status, :feedback, :approved_seconds)
    if params.dig(:time_audit_review, :annotations)
      raw = params[:time_audit_review][:annotations]&.to_unsafe_h
      # Only allow the expected { "recordings" => { "<id>" => { ... } } } structure
      permitted[:annotations] = raw.is_a?(Hash) ? raw.slice("recordings") : nil
    end
    permitted.to_h
  end

  # Stamp the current reviewer's id on each recording annotation that doesn't already
  # have one, so the dashboard leaderboard can attribute hours to the correct reviewer
  # rather than crediting all hours to whoever submits/approves the review.
  def stamp_annotation_reviewer(permitted_params)
    recordings = permitted_params.dig(:annotations, "recordings")
    return permitted_params unless recordings.is_a?(Hash)

    existing = @review.annotations&.dig("recordings") || {}
    recordings.each do |rec_id, data|
      next if existing.dig(rec_id, "reviewer_id").present? # preserve original annotator
      data["reviewer_id"] = current_user.id
    end

    permitted_params
  end

  def serialize_review_detail(review)
    {
      id: review.id,
      ship_id: review.ship_id,
      status: review.status,
      feedback: review.feedback,
      approved_seconds: review.approved_seconds,
      annotations: review.annotations,
      reviewer_display_name: review.reviewer&.display_name,
      created_at: review.created_at.strftime("%B %d, %Y")
    }
  end

  def serialize_ship_context(ship)
    {
      id: ship.id,
      ship_type: ship.ship_type,
      status: ship.status,
      created_at: ship.created_at.strftime("%B %d, %Y")
    }
  end

  def serialize_project_context(project)
    {
      id: project.id,
      name: project.name,
      description: project.description,
      repo_link: project.repo_link,
      demo_link: project.demo_link,
      user_id: project.user_id,
      user_display_name: project.user.display_name,
      user_avatar: project.user.avatar
    }
  end

  def serialize_journal_entry(journal_entry)
    {
      id: journal_entry.id,
      content_html: helpers.render_user_markdown(journal_entry.content.to_s),
      images: journal_entry.images.map { |img| url_for(img) },
      author_display_name: journal_entry.user.display_name,
      author_avatar: journal_entry.user.avatar,
      created_at: journal_entry.created_at.strftime("%b %d, %Y"),
      created_at_iso: journal_entry.created_at.iso8601,
      recordings: journal_entry.recordings.map { |r| serialize_recording(r) },
      total_duration: journal_entry.recordings.sum { |r| recording_duration(r) }
    }
  end

  def serialize_recording(recording)
    recordable = recording.recordable
    base = {
      id: recording.id,
      type: recording.recordable_type,
      duration: recording_duration(recording),
      name: recordable.try(:name) || recordable.try(:title) || "Recording",
      inactive_segments: recordable.try(:inactive_segments) || [],
      inactive_percentage: recordable.try(:inactive_percentage),
      activity_checked: recordable.try(:activity_checked_at).present?
    }

    case recordable
    when LookoutTimelapse
      base.merge(playback_url: recordable.playback_url, thumbnail_url: recordable.thumbnail_url)
    when LapseTimelapse
      base.merge(playback_url: recordable.playback_url, thumbnail_url: recordable.thumbnail_url)
    when YouTubeVideo
      base.merge(
        recordable_id: recordable.id, # YouTubeVideo record id for admin refetch action
        video_id: recordable.video_id,
        thumbnail_url: recordable.thumbnail_url,
        yt_duration_seconds: recordable.duration_seconds # used as timeline fallback before YT player loads
      )
    else
      base
    end
  end
end
