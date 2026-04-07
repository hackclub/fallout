class Admin::ProjectsController < Admin::ApplicationController
  def index
    base_scope = policy_scope(Project).includes(:user)
    base_scope = base_scope.kept unless params[:include_deleted] == "1"
    base_scope = base_scope.where(is_unlisted: false) if params[:hide_unlisted] == "1"
    base_scope = base_scope.where("EXISTS (SELECT 1 FROM journal_entries WHERE journal_entries.project_id = projects.id AND journal_entries.discarded_at IS NULL)") if params[:with_journals] == "1"
    search_scope = base_scope
    search_scope = search_scope.search_for(params[:query]) if params[:query].present?
    @pagy, @projects = pagy(search_scope.order(created_at: :desc))
    project_ids = @projects.map(&:id)
    @entry_counts = JournalEntry.where(project_id: project_ids, discarded_at: nil).group(:project_id).count
    @last_entries = JournalEntry.where(project_id: project_ids, discarded_at: nil).group(:project_id).maximum(:created_at)
    @hours_tracked = Project.batch_time_logged(project_ids)

    render inertia: {
      projects: @projects.map { |p| serialize_project_row(p) },
      pagy: pagy_props(@pagy),
      query: params[:query].to_s,
      include_deleted: params[:include_deleted] == "1",
      hide_unlisted: params[:hide_unlisted] == "1",
      with_journals: params[:with_journals] == "1",
      total_count: base_scope.count
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
      journal_entries: @entries.map { |je| serialize_journal_entry(je, @ta_annotations) },
      pagy_entries: pagy_props(@pagy_entries)
    }
    props[:audit_log] = InertiaRails.defer { serialize_audit_log(@project) } if current_user.admin? # Audit log — admin-only
    render inertia: props
  end

  private

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
      created_at: project.created_at.strftime("%b %d, %Y")
    }
  end

  def serialize_project_detail(project)
    entry_count = project.journal_entries.where(discarded_at: nil).count
    last_entry = project.journal_entries.where(discarded_at: nil).maximum(:created_at)

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
      last_entry_at: last_entry&.strftime("%b %d, %Y"),
      created_at: project.created_at.strftime("%b %d, %Y"),
      collaborators: project.collaborator_users.map { |u| { id: u.id, display_name: u.display_name, avatar: u.avatar } }
    }
  end

  def serialize_ship_row(ship)
    public_hrs = ship.approved_seconds ? (ship.approved_seconds / 3600.0).round(1) : nil
    internal_hrs = compute_internal_hours(ship)
    {
      id: ship.id,
      status: ship.status,
      approved_public_hours: public_hrs,
      approved_internal_hours: internal_hrs,
      review_statuses: {
        time_audit: ship.time_audit_review&.status,
        requirements_check: ship.requirements_check_review&.status,
        design_review: ship.design_review&.status,
        build_review: ship.build_review&.status
      },
      created_at: ship.created_at.strftime("%b %d, %Y")
    }
  end

  def compute_internal_hours(ship)
    base = ship.approved_seconds || 0
    dr_adj = ship.design_review&.hours_adjustment || 0
    br_adj = ship.build_review&.hours_adjustment || 0
    total = base + dr_adj + br_adj
    return nil if base.zero? && dr_adj.zero? && br_adj.zero?
    (total / 3600.0).round(1)
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
      recordings: recs.map { |r| serialize_recording_summary(r, rec_annotations) }
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
    rec.respond_to?(:duration_seconds) ? rec.duration_seconds.to_i : rec.duration.to_i
  end

  def compute_removed_seconds(segments)
    segments.sum do |seg|
      video_range = seg["end_seconds"].to_f - seg["start_seconds"].to_f
      real_range = video_range * 60
      case seg["type"]
      when "removed" then real_range
      when "deflated" then real_range * (seg["deflated_percent"].to_f / 100)
      else 0
      end
    end.round
  end

  def serialize_recording_summary(recording, rec_annotations = {})
    duration = recording_duration(recording)
    rec_data = rec_annotations[recording.id.to_s] || {}
    segments = rec_data["segments"] || []
    removed = segments.any? ? compute_removed_seconds(segments) : 0
    {
      id: recording.id,
      type: recording.recordable_type,
      name: recording.recordable.try(:name) || recording.recordable.try(:title) || "Recording",
      duration: duration,
      removed_seconds: removed,
      description: rec_data["description"]
    }
  end
end
