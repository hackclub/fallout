class Admin::FeaturedProjectsController < Admin::ApplicationController
  before_action :require_admin!, except: [ :index, :projects_search ] # Staff read-only; admin writes

  TABS = %w[active archived].freeze

  def index
    tab = TABS.include?(params[:tab]) ? params[:tab] : "active"
    scope = policy_scope(FeaturedProject)
      .includes(:featured_by_user, project: [ :user, { unified_thumbnail_attachment: :blob } ])

    featured = if tab == "archived"
      scope.discarded.order(discarded_at: :desc)
    else
      scope.kept.ordered
    end

    render inertia: "admin/featured_projects/index", props: {
      featured: featured.map { |fp| serialize_admin_featured_project(fp) },
      current_tab: tab,
      counts: {
        active: scope.kept.count,
        archived: scope.discarded.count
      }
    }
  end

  def create
    @featured = FeaturedProject.new(
      project_id: create_params[:project_id],
      note: create_params[:note].presence,
      featured_by_user_id: current_user.id,
      featured_at: Time.current,
      position: (FeaturedProject.kept.maximum(:position) || -1) + 1
    )
    authorize @featured

    if @featured.save
      redirect_to admin_featured_projects_path(tab: "active"), notice: "Project featured."
    else
      redirect_back fallback_location: admin_featured_projects_path,
        inertia: { errors: @featured.errors.messages }
    end
  end

  def destroy
    @featured = FeaturedProject.find(params[:id])
    authorize @featured
    @featured.discard
    # Stay where the admin already was (project detail page, featured list, etc.) so unfeature
    # doesn't yank them to the featured projects index. Feature/restore still redirect there so
    # the admin can reorder immediately.
    redirect_back fallback_location: admin_featured_projects_path(tab: params[:tab].presence || "active"),
      notice: "Project unfeatured."
  end

  def restore
    @featured = FeaturedProject.find(params[:id])
    authorize @featured

    if FeaturedProject.kept.exists?(project_id: @featured.project_id)
      redirect_back fallback_location: admin_featured_projects_path,
        inertia: { errors: { base: [ "This project is already featured." ] } }
      return
    end

    if @featured.project.discarded? || @featured.project.is_unlisted?
      redirect_back fallback_location: admin_featured_projects_path,
        inertia: { errors: { base: [ "Project is no longer eligible (deleted or unlisted)." ] } }
      return
    end

    @featured.update(
      discarded_at: nil,
      position: (FeaturedProject.kept.maximum(:position) || -1) + 1
    )
    redirect_to admin_featured_projects_path(tab: "active"), notice: "Project restored."
  end

  def update_note
    @featured = FeaturedProject.find(params[:id])
    authorize @featured

    if @featured.update(note: note_params[:note].presence)
      redirect_back fallback_location: admin_featured_projects_path, notice: "Note saved."
    else
      redirect_back fallback_location: admin_featured_projects_path,
        inertia: { errors: @featured.errors.messages }
    end
  end

  def reorder
    authorize FeaturedProject.new, :reorder?
    ids = Array(params[:ids]).filter_map { |id| Integer(id, exception: false) }

    FeaturedProject.transaction do
      FeaturedProject.kept.where(id: ids).find_each do |fp|
        fp.update_column(:position, ids.index(fp.id))
      end
    end

    # Single broadcast after the bulk update completes — explicitly ping the stream because
    # update_column skips callbacks, so the per-row Broadcastable hook does not fire.
    ActionCable.server.broadcast(
      "live_updates:featured_projects",
      { stream: "featured_projects", action: "update" }
    )

    # Must redirect (not head :no_content) — Inertia treats any response without the X-Inertia
    # header as a non-Inertia response and renders it inside a fullscreen debug modal. The
    # frontend pairs this with only: [] on router.patch so no props are actually refetched.
    redirect_to admin_featured_projects_path(tab: "active")
  end

  def projects_search
    skip_authorization
    skip_policy_scope

    query = params[:q].to_s.strip
    return render(json: { projects: [] }) if query.blank?

    ranked_ids = search_project_ids(query, limit: 20)
    return render(json: { projects: [] }) if ranked_ids.empty?

    # Exclude projects that are already actively featured — admins can't double-feature.
    featured_project_ids = FeaturedProject.kept.pluck(:project_id)
    ranked_ids -= featured_project_ids
    return render(json: { projects: [] }) if ranked_ids.empty?

    order_sql = ActiveRecord::Base.send(:sanitize_sql_array, [ "array_position(ARRAY[?]::bigint[], projects.id)", ranked_ids ])
    projects = Project.public_for_explore
      .where(id: ranked_ids)
      .reorder(Arel.sql(order_sql))
      .includes(:user, unified_thumbnail_attachment: :blob)

    render json: {
      projects: projects.map { |p|
        {
          id: p.id,
          name: p.name,
          owner_display_name: p.user.display_name,
          owner_avatar: p.user.avatar,
          thumbnail_url: (url_for(p.unified_thumbnail) if p.unified_thumbnail.attached?),
          repo_link: p.repo_link
        }
      }
    }
  end

  private

  # Meilisearch is preferred (typo tolerance, relevance ranking) but falls back to pg_search
  # when the service is unreachable or when newly inserted projects haven't been indexed yet
  # (MeilisearchReindexJob runs async after_commit, so there's a window where new records
  # are queryable in Postgres but not yet in Meilisearch). Mirrors the same pattern used in
  # BulletinBoardController#search_projects_for_explore.
  def search_project_ids(query, limit:)
    Project.ms_search(query, limit: limit).map(&:id)
  rescue Meilisearch::ApiError, Meilisearch::CommunicationError, Errno::ECONNREFUSED
    Project.public_for_explore.search(query).select(:id).limit(limit).map(&:id)
  end

  def create_params
    params.expect(featured_project: [ :project_id, :note ])
  end

  def note_params
    params.expect(featured_project: [ :note ])
  end

  def serialize_admin_featured_project(fp)
    project = fp.project
    {
      id: fp.id,
      position: fp.position,
      note: fp.note,
      featured_at: fp.featured_at&.iso8601,
      discarded_at: fp.discarded_at&.iso8601,
      featured_by: {
        id: fp.featured_by_user.id,
        display_name: fp.featured_by_user.display_name,
        avatar: fp.featured_by_user.avatar
      },
      project: {
        id: project.id,
        name: project.name,
        repo_link: project.repo_link,
        is_discarded: project.discarded?,
        is_unlisted: project.is_unlisted,
        thumbnail_url: (url_for(project.unified_thumbnail) if project.unified_thumbnail.attached?),
        owner_display_name: project.user.display_name,
        owner_avatar: project.user.avatar,
        owner_id: project.user_id
      }
    }
  end
end
