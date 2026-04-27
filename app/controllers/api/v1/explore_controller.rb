require "base64"

class Api::V1::ExploreController < Api::V1::BaseController
  skip_before_action :authenticate_api_key!, only: %i[projects journals] # Public explore feed, no auth required.

  CATEGORIES = %w[projects journals].freeze
  SORTS = %w[active newest].freeze
  DEFAULT_LIMIT = 20
  MAX_LIMIT = 50
  PROJECT_ACTIVITY_NULL_CURSOR_VALUE = "none".freeze
  PROJECT_ACTIVITY_SQL = "latest_activity.last_activity_at".freeze
  PROJECT_ACTIVITY_SELECT_SQL = "projects.*, #{PROJECT_ACTIVITY_SQL} AS explore_activity_at".freeze
  PROJECT_ACTIVITY_ORDER_SQL = "#{PROJECT_ACTIVITY_SQL} DESC NULLS LAST, projects.id DESC".freeze

  # GET /api/v1/explore/projects
  # Params: sort (active|newest), query, cursor, limit
  def projects
    sort = normalized_sort
    query = params[:query].to_s.strip.presence
    effective_limit = query.present? ? MAX_LIMIT : limit

    scope = Project.public_for_explore.preload(:user)

    if query.present?
      ranked_ids = search_project_ids(query)
      return render json: empty_response("projects", sort, query) if ranked_ids.empty?

      projects = scope.where(id: ranked_ids)
                      .order(Arel.sql("array_position(ARRAY[#{ranked_ids.join(',')}]::bigint[], projects.id)"))
                      .limit(effective_limit + 1)
                      .to_a
      has_more = projects.size > effective_limit
      projects = projects.first(effective_limit)
      preload_project_context(projects)

      return render json: build_response("projects", projects.map { |p| serialize_project(p) }, nil, has_more, sort, query)
    end

    scope = order_projects(scope, sort)
    scope = apply_project_cursor(scope, sort: sort, cursor: params[:cursor])

    projects = scope.limit(effective_limit + 1).to_a
    has_more = projects.size > effective_limit
    projects = projects.first(effective_limit)
    preload_project_context(projects)

    render json: build_response(
      "projects",
      projects.map { |p| serialize_project(p) },
      has_more ? encode_project_cursor(projects.last, sort: sort) : nil,
      has_more,
      sort,
      query.to_s
    )
  rescue ArgumentError
    render json: { error: "Invalid cursor" }, status: :bad_request
  end

  # GET /api/v1/explore/journals
  # Params: query, cursor, limit
  def journals
    query = params[:query].to_s.strip.presence
    effective_limit = query.present? ? MAX_LIMIT : limit

    scope = JournalEntry.public_for_explore

    if query.present?
      begin
        matching_ids = JournalEntry.ms_search(query, sort: ["created_at:desc"], limit: 500).map(&:id)
        scope = scope.where(id: matching_ids)
      rescue Meilisearch::ApiError, Errno::ECONNREFUSED
        scope = scope.search(query)
      end
    end

    latest_ids = scope
      .select("DISTINCT ON (journal_entries.project_id) journal_entries.id")
      .reorder("journal_entries.project_id, journal_entries.created_at DESC, journal_entries.id DESC")

    entries_scope = JournalEntry.where(id: latest_ids).order(created_at: :desc, id: :desc)
    entries_scope = apply_journal_cursor(entries_scope, params[:cursor])

    entries = entries_scope.limit(effective_limit + 1).to_a
    has_more = entries.size > effective_limit
    entries = entries.first(effective_limit)

    ActiveRecord::Associations::Preloader.new(
      records: entries,
      associations: [ :user, :project, { images_attachments: :blob } ]
    ).call

    render json: build_response(
      "journals",
      entries.map { |e| serialize_journal(e) },
      has_more ? encode_journal_cursor(entries.last) : nil,
      has_more,
      "newest",
      query.to_s
    )
  rescue ArgumentError
    render json: { error: "Invalid cursor" }, status: :bad_request
  end

  private

  def limit
    raw = params[:limit].presence&.to_i || DEFAULT_LIMIT
    raw.clamp(1, MAX_LIMIT)
  end

  def normalized_sort
    sort = params[:sort].to_s
    SORTS.include?(sort) ? sort : "active"
  end

  # --- Project helpers ---

  def order_projects(scope, sort)
    return scope.order(created_at: :desc, id: :desc) if sort == "newest"

    scope.joins("LEFT JOIN (#{latest_activity_sql.to_sql}) latest_activity ON latest_activity.project_id = projects.id")
         .select(PROJECT_ACTIVITY_SELECT_SQL)
         .order(Arel.sql(PROJECT_ACTIVITY_ORDER_SQL))
  end

  def latest_activity_sql
    JournalEntry.public_for_explore.group(:project_id).select("project_id, MAX(journal_entries.created_at) AS last_activity_at")
  end

  def apply_project_cursor(scope, sort:, cursor:)
    return scope if cursor.blank?

    cursor_at, cursor_id = decode_project_cursor(cursor)
    if sort == "newest"
      raise ArgumentError if cursor_at.nil?

      scope.where(
        "projects.created_at < :cursor_at OR (projects.created_at = :cursor_at AND projects.id < :cursor_id)",
        cursor_at: cursor_at, cursor_id: cursor_id
      )
    else
      apply_active_project_cursor(scope, cursor_at, cursor_id)
    end
  end

  def apply_active_project_cursor(scope, cursor_at, cursor_id)
    if cursor_at
      scope.where(
        [
          "#{PROJECT_ACTIVITY_SQL} < :cursor_at",
          "(#{PROJECT_ACTIVITY_SQL} = :cursor_at AND projects.id < :cursor_id)",
          "#{PROJECT_ACTIVITY_SQL} IS NULL"
        ].join(" OR "),
        cursor_at: cursor_at, cursor_id: cursor_id
      )
    else
      scope.where("#{PROJECT_ACTIVITY_SQL} IS NULL AND projects.id < :cursor_id", cursor_id: cursor_id)
    end
  end

  def encode_project_cursor(project, sort:)
    return nil unless project

    cursor_time = project_cursor_time(project, sort: sort)
    cursor_time_value = cursor_time ? cursor_time.iso8601(6) : PROJECT_ACTIVITY_NULL_CURSOR_VALUE
    Base64.urlsafe_encode64("#{cursor_time_value}|#{project.id}", padding: false)
  end

  def decode_project_cursor(cursor)
    cursor_at, cursor_id = Base64.urlsafe_decode64(cursor).split("|", 2)
    raise ArgumentError if cursor_at.blank? || cursor_id.blank?

    [
      cursor_at == PROJECT_ACTIVITY_NULL_CURSOR_VALUE ? nil : Time.iso8601(cursor_at),
      Integer(cursor_id)
    ]
  end

  def project_cursor_time(project, sort:)
    timestamp = if sort == "newest"
      project.created_at
    elsif project.has_attribute?("explore_activity_at")
      project.read_attribute("explore_activity_at").presence
    end
    return nil if timestamp.blank?

    timestamp.respond_to?(:iso8601) ? timestamp : Time.zone.parse(timestamp.to_s)
  end

  def preload_project_context(projects)
    project_ids = projects.map(&:id)
    @journal_counts = JournalEntry.kept.where(project_id: project_ids).group(:project_id).count

    latest_ids = JournalEntry.public_for_explore
      .where(project_id: project_ids)
      .select("DISTINCT ON (journal_entries.project_id) journal_entries.id")
      .order("journal_entries.project_id, journal_entries.created_at DESC, journal_entries.id DESC")
    @latest_entries = JournalEntry.where(id: latest_ids).index_by(&:project_id)

    cover_ids = JournalEntry.public_for_explore
      .where(project_id: project_ids)
      .joins(:images_attachments)
      .select("DISTINCT ON (journal_entries.project_id) journal_entries.id")
      .order("journal_entries.project_id, journal_entries.created_at DESC, journal_entries.id DESC")
    @cover_entries = JournalEntry.where(id: cover_ids)
      .preload(images_attachments: :blob)
      .index_by(&:project_id)
  end

  def search_project_ids(query)
    project_ids = Project.ms_search(query, filter: "is_unlisted = false", sort: ["journal_count:desc", "created_at:desc"], limit: 500).map(&:id)
    journal_project_ids = JournalEntry.ms_search(query, sort: ["created_at:desc"], limit: 500).map(&:project_id).uniq
    (project_ids + (journal_project_ids - project_ids)).uniq
  rescue Meilisearch::ApiError, Errno::ECONNREFUSED
    project_matches = Project.public_for_explore.search(query).select(:id).map(&:id)
    journal_matches = JournalEntry.public_for_explore.search(query).select(:project_id).map(&:project_id)
    (project_matches + (journal_matches - project_matches)).uniq
  end

  def serialize_project(project)
    latest_entry = @latest_entries[project.id]
    cover_entry = @cover_entries[project.id]
    cover_url = cover_entry ? url_for(cover_entry.images.first) : nil
    last_activity_at = (project.has_attribute?("explore_activity_at") && project.read_attribute("explore_activity_at").presence) || latest_entry&.created_at

    {
      id: project.id,
      name: project.name,
      description: project.description,
      tags: project.tags,
      cover_image_url: cover_url,
      owner: serialize_user(project.user),
      journal_entries_count: @journal_counts[project.id] || 0,
      latest_journal_excerpt: latest_entry ? plain_text_excerpt(latest_entry.content.to_s, 180) : nil,
      latest_journal_date: latest_entry&.created_at&.iso8601,
      last_activity_at: last_activity_at.presence && (last_activity_at.respond_to?(:iso8601) ? last_activity_at.iso8601 : Time.zone.parse(last_activity_at.to_s).iso8601),
      created_at: project.created_at.iso8601,
      url: "#{request.base_url}/projects/#{project.id}"
    }
  end

  # --- Journal helpers ---

  def apply_journal_cursor(scope, cursor)
    return scope if cursor.blank?

    cursor_at, cursor_id = decode_journal_cursor(cursor)
    scope.where(
      "journal_entries.created_at < :cursor_at OR (journal_entries.created_at = :cursor_at AND journal_entries.id < :cursor_id)",
      cursor_at: cursor_at, cursor_id: cursor_id
    )
  end

  def encode_journal_cursor(entry)
    return nil unless entry

    Base64.urlsafe_encode64("#{entry.created_at.iso8601(6)}|#{entry.id}", padding: false)
  end

  def decode_journal_cursor(cursor)
    cursor_at, cursor_id = Base64.urlsafe_decode64(cursor).split("|", 2)
    raise ArgumentError if cursor_at.blank? || cursor_id.blank?

    [ Time.iso8601(cursor_at), Integer(cursor_id) ]
  end

  def serialize_journal(entry)
    {
      id: entry.id,
      project_id: entry.project_id,
      project_name: entry.project.name,
      excerpt: plain_text_excerpt(entry.content.to_s, 180),
      cover_image_url: entry.images.attached? ? url_for(entry.images.first) : nil,
      tags: entry.project.tags,
      author: serialize_user(entry.user),
      date: entry.created_at.iso8601,
      url: "#{request.base_url}/projects/#{entry.project_id}?journal_entry_id=#{entry.id}"
    }
  end

  # --- Shared helpers ---

  def serialize_user(user)
    { id: user.id, display_name: user.display_name, avatar: user.avatar }
  end

  def plain_text_excerpt(content, length)
    doc = Nokogiri::HTML::DocumentFragment.parse(ApplicationController.helpers.render_user_markdown(content))
    doc.css("img, .external-image-callout").remove
    doc.text.squish.truncate(length)
  end

  def build_response(category, entries, next_cursor, has_more, sort, query)
    {
      data: entries,
      pagination: {
        next_cursor: next_cursor,
        has_more: has_more
      },
      meta: {
        category: category,
        sort: sort,
        query: query
      }
    }
  end

  def empty_response(category, sort, query)
    build_response(category, [], nil, false, sort, query.to_s)
  end
end
