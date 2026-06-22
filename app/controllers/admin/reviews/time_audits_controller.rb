class Admin::Reviews::TimeAuditsController < Admin::Reviews::BaseController
  def index
    # Filter/sort chrome and stats keys render instantly; the heavy queue lists are deferred
    # so the page shell appears immediately and the tables show a skeleton until data lands.
    ticket_eligible = parse_ticket_filter
    render inertia: {
      start_reviewing_path: next_admin_reviews_time_audits_path,
      ticket_eligible: ticket_eligible,
      **review_stats_props(TimeAuditReview),
      **deferred_index_props(ticket_eligible)
    }
  end

  def show
    authorize @review

    ship = @review.ship
    project = ship.project

    new_entries = ship.new_journal_entries
      .includes(:user, images_attachments: :blob, recordings: :recordable)
      .order(created_at: :asc)

    previous_entries = ship.previous_journal_entries
      .includes(:user, images_attachments: :blob, recordings: :recordable)
      .order(created_at: :asc)

    render inertia: {
      review: serialize_review_detail(@review),
      ship: serialize_ship_context(ship),
      project: serialize_project_context(project),
      new_entries: new_entries.map { |je| serialize_journal_entry(je, ship) },
      previous_entries: previous_entries.map { |je| serialize_journal_entry(je, ship) },
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

    params_for_update = stamp_annotation_reviewer(review_params)
    if link_only_feedback?(params_for_update[:feedback] || params_for_update["feedback"])
      return redirect_back fallback_location: admin_reviews_time_audit_path(@review),
                           inertia: { errors: { feedback: [ "Feedback cannot be only a link. Please explain your time audit decision." ] } }
    end

    @review.finalizing_user = current_user # Reviewable#stamp_finalizing_reviewer backfills reviewer_id on terminal save when claim was cleared mid-session
    if @review.update(params_for_update)
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

  # Memoized loader shared by the deferred index props so the heavy queue query runs once per
  # deferred request even though pending_reviews/all_reviews/pagy are separate Inertia props.
  def deferred_index_props(ticket_eligible)
    memo = nil
    load = lambda do
      memo ||= begin
        base = policy_scope(TimeAuditReview)
          .includes(ship: [ :project, :requirements_check_review, :time_audit_review, project: :user ], reviewer: [])

        pending_reviews = base.pending.where.not(ship_id: flagged_ship_ids).order(created_at: :asc).load
        pending_reviews = filter_ticket_eligible(pending_reviews) if ticket_eligible
        @pagy, @all_reviews = pagy(base.order(created_at: :desc))
        flagged_ids = ProjectFlag.distinct.pluck(:project_id).to_set
        Ship.preload_cycle_started_at((pending_reviews + @all_reviews).map(&:ship)) # avoid N+1 in serialize_review_row (dedup done inside)
        priority_ids = ReviewPriorityCalculator.priority_ship_ids(pending_reviews.map(&:ship))
        pending_reviews = sort_pending(pending_reviews, nil, {}, priority_ids)
        {
          pending_reviews: pending_reviews.map { |r| serialize_review_row(r, priority_ship_ids: priority_ids) },
          all_reviews: @all_reviews.map { |r| serialize_review_row(r, flagged_project_ids: flagged_ids) },
          pagy: pagy_props(@pagy)
        }
      end
    end
    {
      pending_reviews: InertiaRails.defer(group: "index") { load.call[:pending_reviews] },
      all_reviews: InertiaRails.defer(group: "index") { load.call[:all_reviews] },
      pagy: InertiaRails.defer(group: "index") { load.call[:pagy] }
    }
  end

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
    permitted = params.require(:time_audit_review).permit(:status, :feedback, :approved_public_seconds)
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

  def link_only_feedback?(feedback)
    text = feedback.to_s.strip
    return false if text.blank?

    tokens = text.split(/\s+/)
    tokens.all? { |token| token.match?(%r{\Ahttps?://\S+\z}) }
  end

  def serialize_review_detail(review)
    {
      id: review.id,
      ship_id: review.ship_id,
      status: review.status,
      feedback: review.feedback,
      approved_public_seconds: review.approved_public_seconds,
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
      user_avatar: project.user.avatar,
      collaborators: project.collaborator_users.map { |u| { id: u.id, display_name: u.display_name, avatar: u.avatar } }
    }
  end

  def serialize_journal_entry(journal_entry, ship)
    {
      id: journal_entry.id,
      content_html: helpers.render_user_markdown(journal_entry.content.to_s),
      images: journal_entry.images.map { |img| url_for(img) },
      author_display_name: journal_entry.user.display_name,
      author_avatar: journal_entry.user.avatar,
      created_at: journal_entry.created_at.strftime("%b %d, %Y"),
      created_at_iso: journal_entry.created_at.iso8601,
      recordings: journal_entry.recordings.map { |r| serialize_recording(r) },
      total_duration: journal_entry.recordings.sum { |r| recording_duration(r) },
      in_ship: journal_entry.ship_id == ship.id # Entry was claimed by the ship under review (vs an older ship)
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
      if recordable.timelapse_ready?
        # Processed: present like a Lapse/Lookout timelapse — native player + 60× billing.
        base.merge(
          timelapse_ready: true,
          playback_url: youtube_timelapse_service.presigned_playback_url(recordable),
          thumbnail_url: recordable.thumbnail_url
        )
      else
        base.merge(
          timelapse_ready: false,
          recordable_id: recordable.id, # YouTubeVideo record id for admin refetch action
          video_id: recordable.video_id,
          thumbnail_url: recordable.thumbnail_url,
          yt_duration_seconds: recordable.duration_seconds # used as timeline fallback before YT player loads
        )
      end
    else
      base
    end
  end

  # Memoized so a request serializing many recordings reuses one R2 signer (presigning is local, no network).
  def youtube_timelapse_service
    @youtube_timelapse_service ||= YouTubeTimelapseService.new
  end
end
