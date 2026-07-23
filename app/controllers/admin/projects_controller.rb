class Admin::ProjectsController < Admin::ApplicationController
  before_action :require_admin!, except: :show # Mutations require full admin; show is staff-accessible

  def index
    # policy_scope runs on the critical path so verify_policy_scoped passes on the initial
    # (deferred) render; it's lazy, so no query fires until the deferred loader enumerates it.
    scope = policy_scope(Project)
    # Filter chrome renders instantly; the heavy query + serialization is deferred so the
    # page shell appears immediately and the table shows a skeleton until data lands.
    render inertia: {
      query: params[:query].to_s,
      include_deleted: params[:include_deleted] == "1",
      hide_unlisted: params[:hide_unlisted] == "1",
      with_journals: params[:with_journals] == "1",
      **deferred_index_props(scope)
    }
  end

  def show
    @project = Project.includes(:user, :collaborator_users).find(params[:id])
    authorize @project
    @pagy_ships, @ships = pagy(
      @project.ships
        .includes(:time_audit_review, :requirements_check_review, :design_review, :build_review)
        .order(created_at: :desc),
      param_name: :ships_page
    )
    @pagy_entries, @entries = pagy(
      @project.journal_entries.kept
        .includes(:user, images_attachments: :blob, recordings: :recordable)
        .order(created_at: :desc),
      param_name: :entries_page
    )
    @ta_annotations = preload_ta_annotations(@entries)

    props = {
      project: serialize_project_detail(@project),
      ships: @ships.map { |s| serialize_ship_row(s) },
      pagy_ships: pagy_props(@pagy_ships),
      all_reviews: serialize_all_project_reviews(@project),
      journal_entries: @entries.map { |je| serialize_journal_entry(je, @ta_annotations) },
      pagy_entries: pagy_props(@pagy_entries)
    }
    props[:audit_log] = InertiaRails.defer { serialize_audit_log(@project) } if current_user.admin? # Audit log — admin-only
    render inertia: props
  end

  def update_manual_seconds
    @project = Project.find(params[:id])
    authorize @project, :update_manual_seconds?
    hours = params[:manual_hours].to_f
    @project.update!(manual_seconds: (hours * 3600).round)
    redirect_back fallback_location: admin_project_path(@project)
  end

  def toggle_burnout
    @project = Project.find(params[:id])
    authorize @project, :toggle_burnout?
    tags = @project.tags.dup
    if tags.include?("burnout")
      tags.delete("burnout")
    else
      tags << "burnout"
    end
    @project.update!(tags:)
    redirect_back fallback_location: admin_project_path(@project)
  end

  def toggle_unlisted
    @project = Project.find(params[:id])
    authorize @project, :toggle_unlisted?
    @project.update!(is_unlisted: !@project.is_unlisted)
    redirect_back fallback_location: admin_project_path(@project)
  end

  private

  # Memoized loader shared by the deferred index props so the heavy query runs once per
  # deferred request even though projects/pagy/total_count are separate Inertia props.
  def deferred_index_props(scope)
    memo = nil
    load = lambda do
      memo ||= begin
        base_scope = scope.includes(:user)
        base_scope = base_scope.kept unless params[:include_deleted] == "1"
        base_scope = base_scope.where(is_unlisted: false) if params[:hide_unlisted] == "1"
        base_scope = base_scope.where("EXISTS (SELECT 1 FROM journal_entries WHERE journal_entries.project_id = projects.id AND journal_entries.discarded_at IS NULL)") if params[:with_journals] == "1"
        search_scope = base_scope
        if params[:query].present?
          # Meilisearch returns a relevance-ordered list of IDs. Re-apply via a positional
          # ORDER to preserve relevance — keeps typo-tolerant / partial-word matches at the
          # top instead of sinking to the bottom under created_at desc.
          ranked_ids = begin
            Project.ms_search(params[:query], limit: 200).map(&:id)
          rescue Meilisearch::ApiError, Meilisearch::CommunicationError, Errno::ECONNREFUSED
            # pg_search fallback (rank-ordered, GIN-indexed) keeps admin search
            # working when Meilisearch is down. Loses typo tolerance only.
            Project.search(params[:query]).limit(200).pluck(:id)
          end
          if ranked_ids.any?
            order_sql = ActiveRecord::Base.send(:sanitize_sql_array, [ "array_position(ARRAY[?]::bigint[], projects.id)", ranked_ids ])
            search_scope = search_scope.where(id: ranked_ids).reorder(Arel.sql(order_sql))
          else
            search_scope = search_scope.none
          end
          @pagy, @projects = pagy(search_scope)
          total = base_scope.count
        else
          @pagy, @projects = pagy(search_scope.order(created_at: :desc))
          # Without a search, pagy already counted base_scope — reuse it instead of a second COUNT.
          total = @pagy.count
        end
        project_ids = @projects.map(&:id)
        @entry_counts = JournalEntry.where(project_id: project_ids, discarded_at: nil).group(:project_id).count
        @last_entries = JournalEntry.where(project_id: project_ids, discarded_at: nil).group(:project_id).maximum(:created_at)
        @hours_tracked = Project.batch_time_logged(project_ids)
        @featured_project_ids = FeaturedProject.kept.where(project_id: project_ids).pluck(:project_id).to_set
        { projects: @projects.map { |p| serialize_project_row(p) }, pagy: pagy_props(@pagy), total_count: total }
      end
    end
    {
      projects: InertiaRails.defer(group: "index") { load.call[:projects] },
      pagy: InertiaRails.defer(group: "index") { load.call[:pagy] },
      total_count: InertiaRails.defer(group: "index") { load.call[:total_count] }
    }
  end

  def serialize_project_row(project)
    {
      id: project.id,
      name: project.name,
      user_id: project.user_id,
      user_display_name: project.user.display_name,
      journal_entries_count: @entry_counts[project.id] || 0,
      repo_link: project.repo_link,
      hours_tracked: ((@hours_tracked[project.id] || 0) / 3600.0).round(1),
      last_entry_at: @last_entries[project.id]&.strftime("%b %d, %Y"),
      is_unlisted: project.is_unlisted,
      is_discarded: project.discarded?,
      is_featured: @featured_project_ids&.include?(project.id) || false,
      created_at: project.created_at.strftime("%b %d, %Y")
    }
  end

  def serialize_project_detail(project)
    entry_count = project.journal_entries.where(discarded_at: nil).count
    last_entry = project.journal_entries.where(discarded_at: nil).maximum(:created_at)
    featured_project_id = FeaturedProject.kept.where(project_id: project.id).pick(:id)

    {
      id: project.id,
      name: project.name,
      description: project.description,
      demo_link: project.demo_link,
      repo_link: project.repo_link,
      is_unlisted: project.is_unlisted,
      tags: project.tags,
      is_discarded: project.discarded?,
      discarded_at: project.discarded_at&.strftime("%b %d, %Y"),
      user_id: project.user_id,
      user_display_name: project.user.display_name,
      user_avatar: project.user.avatar,
      journal_entries_count: entry_count,
      hours_tracked: (project.time_logged / 3600.0).round(1),
      manual_hours: (project.manual_seconds / 3600.0).round(2),
      last_entry_at: last_entry&.strftime("%b %d, %Y"),
      created_at: project.created_at.strftime("%b %d, %Y"),
      collaborators: project.collaborator_users.map { |u| { id: u.id, display_name: u.display_name, avatar: u.avatar } },
      featured_project_id: featured_project_id
    }
  end

  def serialize_ship_row(ship)
    public_hrs = ship.approved_public_seconds ? (ship.approved_public_seconds / 3600.0).round(1) : nil
    internal_hrs = internal_hours_display(ship)
    {
      id: ship.id,
      status: ship.status,
      approved_public_hours: public_hrs,
      approved_internal_hours: internal_hrs,
      review_statuses: review_statuses_payload(ship),
      created_at: ship.created_at.strftime("%b %d, %Y")
    }
  end

  # nil when nothing has been approved or adjusted yet, so the UI shows blank
  # instead of "0.0h" for ships still in flight.
  def internal_hours_display(ship)
    seconds = ship.approved_internal_seconds
    return nil if seconds.zero?
    (seconds / 3600.0).round(1)
  end

  def serialize_journal_entry(je, ta_annotations)
    rec_annotations = ta_annotations[je.ship_id] || {}
    recs = je.recordings
    {
      id: je.id,
      content_html: helpers.render_user_markdown(je.content.to_s),
      images: je.images.map { |img| url_for(img) },
      author_display_name: je.user.display_name,
      author_avatar: je.user.avatar,
      created_at: je.created_at.strftime("%b %d, %Y"),
      ship_id: je.ship_id,
      total_duration: recs.sum { |r| recording_duration(r) },
      recordings: recs.map { |r| serialize_recording_summary(r, rec_annotations, include_playback_url: current_user.admin?) }
    }
  end

  def preload_ta_annotations(entries)
    ship_ids = entries.filter_map(&:ship_id).uniq
    return {} if ship_ids.empty?
    TimeAuditReview.where(ship_id: ship_ids).each_with_object({}) do |ta, h|
      h[ta.ship_id] = ta.annotations&.dig("recordings") || {}
    end
  end

  def recording_duration(recording)
    rec = recording.recordable
    if rec.is_a?(YouTubeVideo)
      rec.duration_seconds.to_i * (rec.stretch_multiplier || 1)
    else
      rec.respond_to?(:duration_seconds) ? rec.duration_seconds.to_i : rec.duration.to_i
    end
  end

  def compute_removed_seconds(segments, recording: nil, rec_data: {})
    # Only UNprocessed YouTube uses the reviewer's stretch_multiplier; a processed YouTube video is a
    # real 60× timelapse and deducts like Lapse/Lookout (segments are in timelapse-video seconds).
    raw_youtube = recording&.recordable.is_a?(YouTubeVideo) && !recording.recordable.timelapse_ready?
    multiplier = raw_youtube ? (rec_data["stretch_multiplier"]&.to_f || 1.0) : 60.0
    segments.sum do |seg|
      video_range = seg["end_seconds"].to_f - seg["start_seconds"].to_f
      real_range = video_range * multiplier
      case seg["type"]
      when "removed" then real_range
      when "deflated" then real_range * (seg["deflated_percent"].to_f / 100)
      else 0
      end
    end.round
  end

  def serialize_all_project_reviews(project)
    terminal = %w[approved returned rejected]
    [ RequirementsCheckReview, DesignReview, BuildReview, TimeAuditReview ].flat_map do |klass|
      klass
        .joins(:ship)
        .where(ships: { project_id: project.id }, status: terminal)
        .includes(:reviewer)
        .map do |review|
          [ review.updated_at, {
            ship_id: review.ship_id,
            review_type: klass.name.underscore,
            status: review.status,
            feedback: review.feedback,
            internal_reason: review.try(:internal_reason),
            reviewer_display_name: review.reviewer&.display_name,
            reviewed_at: review.updated_at.strftime("%b %d, %Y")
          } ]
        end
    end.sort_by { |ts, _| -ts.to_i }.map(&:last)
  end

  def serialize_recording_summary(recording, rec_annotations = {}, include_playback_url: false)
    duration = recording_duration(recording)
    rec_data = rec_annotations[recording.id.to_s] || {}
    segments = rec_data["segments"] || []
    removed = segments.any? ? compute_removed_seconds(segments, recording: recording, rec_data: rec_data) : 0
    {
      id: recording.id,
      type: recording.recordable_type,
      name: recording.recordable.try(:name) || recording.recordable.try(:title) || "Recording",
      duration: duration,
      removed_seconds: removed,
      description: rec_data["description"],
      playback_url: include_playback_url ? recording_playback_url(recording) : nil
    }
  end

  def recording_playback_url(recording)
    return unless current_user.admin?

    recordable = recording.recordable
    return recordable.playback_url.presence if recordable.is_a?(LapseTimelapse) || recordable.is_a?(LookoutTimelapse)
    # A processed YouTube video plays from its archived 60× timelapse via a presigned R2 URL.
    return YouTubeTimelapseService.new.presigned_playback_url(recordable) if recordable.is_a?(YouTubeVideo) && recordable.timelapse_ready?

    nil
  end
end
