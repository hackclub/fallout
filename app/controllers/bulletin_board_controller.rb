require "base64"

class BulletinBoardController < ApplicationController
  include BulletinEventSerializer

  EXPLORE_CATEGORIES = %w[projects journals].freeze
  EXPLORE_SORTS = %w[active newest].freeze
  EXPLORE_LIMIT = 5
  EXPLORE_LIMIT_MAX = 50
  PROJECT_ACTIVITY_NULL_CURSOR_VALUE = "none".freeze
  PROJECT_ACTIVITY_SQL = "latest_activity.last_activity_at".freeze
  PROJECT_ACTIVITY_SELECT_SQL = "projects.*, #{PROJECT_ACTIVITY_SQL} AS explore_activity_at".freeze
  PROJECT_ACTIVITY_ORDER_SQL = "#{PROJECT_ACTIVITY_SQL} DESC NULLS LAST, projects.id DESC".freeze
  PROJECT_ACTIVITY_CURSOR_SQL = [
    "#{PROJECT_ACTIVITY_SQL} < :cursor_at",
    "(#{PROJECT_ACTIVITY_SQL} = :cursor_at AND projects.id < :cursor_id)",
    "#{PROJECT_ACTIVITY_SQL} IS NULL"
  ].join(" OR ").freeze
  PROJECT_ACTIVITY_NULL_CURSOR_SQL = "#{PROJECT_ACTIVITY_SQL} IS NULL AND projects.id < :cursor_id".freeze

  allow_unauthenticated_access only: %i[index search event] # Public community hub and Explore feed.
  allow_trial_access only: %i[index search event] # Public community hub, trial users welcome
  skip_onboarding_redirect only: %i[index search event] # Public pages should not force account onboarding.
  skip_after_action :verify_authorized, only: %i[index search event] # No authorizable resource (event detail is public)
  # Explore uses explicit public_for_explore scopes for projects and journals, so public visibility
  # is enforced without exposing owner/collaborator-only policy scopes through this public page.
  skip_after_action :verify_policy_scoped, only: %i[index search event]

  def index
    render inertia: "bulletin_board/index", props: {
      events: real_events,
      featured: placeholder_featured,
      explore: {
        default_category: "projects",
        default_project_sort: "active",
        projects: explore_payload(category: "projects", sort: "active", query: nil, cursor: nil),
        journals: explore_payload(category: "journals", sort: "newest", query: nil, cursor: nil)
      },
      explore_stats: explore_stats,
      is_modal: request.headers["X-InertiaUI-Modal"].present?
    }
  end

  def search
    category = normalized_explore_category

    render json: explore_payload(
      category: category,
      sort: category == "journals" ? "newest" : normalized_explore_sort,
      query: params[:query],
      cursor: params[:cursor],
      limit: normalized_explore_limit
    )
  rescue ArgumentError
    render json: { error: "Invalid cursor" }, status: :bad_request
  end

  def event
    # Drafts (starts_at IS NULL) are admin-only; expose only events that have been scheduled or started.
    @event = BulletinEvent.where.not(starts_at: nil).find(params[:id])
    render inertia: "bulletin_board/events/show", props: {
      event: serialize_bulletin_event(@event),
      is_modal: request.headers["X-InertiaUI-Modal"].present?
    }
  end

  private

  def real_events
    # Drafts (starts_at IS NULL) are admin-only — exclude them from the public Inertia payload.
    BulletinEvent.where.not(starts_at: nil)
                 .order(Arel.sql("COALESCE(starts_at, '9999-01-01') ASC"))
                 .map { |e| serialize_bulletin_event(e) }
  end

  def placeholder_featured
    [
      { image: "https://cdn.hackclub.com/019da253-bf73-7076-84c4-14ca42fe4781/jesuskeyboard.webp", title: "The biblically accurate keyboard", username: "Alex Tran" },
      { image: "https://cdn.hackclub.com/019da254-32dd-7eff-a250-15f538271cc1/minimaimai.webp", title: "Mini Maimai", username: "Tongyu" },
      { image: "https://cdn.hackclub.com/019da254-2ec5-719c-bd5e-b31f9a6a8be8/icepizero.webp", title: "Icepi Zero", username: "Cyao" },
      { image: "https://cdn.hackclub.com/019da254-3669-72bc-baf5-c0d7a0f5da52/splitwave.webp", title: "Split Wave", username: "Antush" }
    ]
  end

  def explore_stats
    projects = Project.public_for_explore
    journals = JournalEntry.public_for_explore

    {
      projects_count: projects.count,
      journals_count: journals.count,
      last_project_created_at: projects.maximum(:created_at)&.iso8601,
      last_journal_created_at: journals.maximum("journal_entries.created_at")&.iso8601
    }
  end

  def explore_payload(category:, sort:, query:, cursor:, limit: EXPLORE_LIMIT)
    query = query.to_s.strip.presence
    # For search queries, load all results in one shot — Meilisearch caps at 500 IDs so
    # pagination would be meaningless without a cursor, and relevance order is already ranked.
    effective_limit = query.present? ? EXPLORE_LIMIT_MAX : limit
    entries, next_cursor, has_more = if category == "journals"
      journal_explore_entries(query: query, cursor: cursor, limit: effective_limit)
    else
      project_explore_entries(sort: sort, query: query, cursor: cursor, limit: effective_limit)
    end

    {
      category: category,
      entries: entries,
      next_cursor: next_cursor,
      has_more: has_more,
      sort: sort,
      query: query.to_s
    }
  end

  def project_explore_entries(sort:, query:, cursor:, limit: EXPLORE_LIMIT)
    scope = policy_scope(Project).public_for_explore

    if query.present?
      ranked_ids = search_projects_for_explore(query)
      return [ [], nil, false ] if ranked_ids.empty?

      # Preserve Meilisearch relevance order via array_position.
      # Cursor pagination doesn't apply when sorting by relevance.
      projects = scope.where(id: ranked_ids)
                      .order(Arel.sql("array_position(ARRAY[#{ranked_ids.join(',')}]::bigint[], projects.id)"))
                      .limit(limit + 1)
                      .preload(:user)
                      .to_a
      has_more = projects.size > limit
      projects = projects.first(limit)
      preload_project_explore_context(projects)

      return [ projects.map { |p| serialize_project_for_explore(p) }, nil, has_more ]
    end

    scope = order_projects_for_explore(scope, sort)
    scope = apply_project_cursor(scope, sort: sort, cursor: cursor)

    projects = scope.limit(limit + 1).preload(:user).to_a
    has_more = projects.size > limit
    projects = projects.first(limit)
    preload_project_explore_context(projects)

    [
      projects.map { |project| serialize_project_for_explore(project) },
      has_more ? encode_project_cursor(projects.last, sort: sort) : nil,
      has_more
    ]
  end

  def search_projects_for_explore(query)
    project_ids = meilisearch_project_ids(query)
    journal_project_ids = meilisearch_journal_project_ids(query)
    # Direct project matches (name/description) rank first, then journal-only matches.
    # Both groups preserve Meilisearch's own score order within themselves.
    (project_ids + (journal_project_ids - project_ids)).uniq
  rescue Meilisearch::ApiError, Errno::ECONNREFUSED
    project_matches = Project.public_for_explore.search(query).select(:id).map(&:id)
    journal_matches = JournalEntry.public_for_explore.search(query).select(:project_id).map(&:project_id)
    (project_matches + (journal_matches - project_matches)).uniq
  end

  def journal_explore_entries(query:, cursor:, limit: EXPLORE_LIMIT)
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
    entries_scope = apply_journal_cursor(entries_scope, cursor)
    entries = entries_scope.limit(limit + 1).to_a

    has_more = entries.size > limit
    entries = entries.first(limit)
    # Preload after slicing so Bullet doesn't flag the discarded +1 row's associations as unused.
    ActiveRecord::Associations::Preloader.new(
      records: entries,
      associations: [ :user, :project, { images_attachments: :blob } ]
    ).call
    markdown_docs = rendered_journal_markdown_documents(entries)
    preload_journal_recording_media(entries, markdown_docs)

    [
      entries.map { |entry| serialize_journal_for_explore(entry, markdown_docs.fetch(entry.id)) },
      has_more ? encode_journal_cursor(entries.last) : nil,
      has_more
    ]
  end

  def order_projects_for_explore(scope, sort)
    return scope.order(created_at: :desc, id: :desc) if sort == "newest"

    scope.joins("LEFT JOIN (#{latest_activity_sql.to_sql}) latest_activity ON latest_activity.project_id = projects.id")
         .select(PROJECT_ACTIVITY_SELECT_SQL)
         .order(Arel.sql(PROJECT_ACTIVITY_ORDER_SQL))
  end

  def apply_project_cursor(scope, sort:, cursor:)
    return scope if cursor.blank?

    cursor_at, cursor_id = decode_project_cursor(cursor)
    if sort == "newest"
      raise ArgumentError if cursor_at.nil?

      scope.where("projects.created_at < :cursor_at OR (projects.created_at = :cursor_at AND projects.id < :cursor_id)", cursor_at: cursor_at, cursor_id: cursor_id)
    else
      apply_active_project_cursor(scope, cursor_at, cursor_id)
    end
  end

  def apply_active_project_cursor(scope, cursor_at, cursor_id)
    if cursor_at
      scope.where(PROJECT_ACTIVITY_CURSOR_SQL, cursor_at: cursor_at, cursor_id: cursor_id)
    else
      scope.where(PROJECT_ACTIVITY_NULL_CURSOR_SQL, cursor_id: cursor_id)
    end
  end

  def latest_activity_sql
    JournalEntry.public_for_explore.group(:project_id).select("project_id, MAX(journal_entries.created_at) AS last_activity_at")
  end

  def normalized_explore_category
    category = params[:category].to_s
    EXPLORE_CATEGORIES.include?(category) ? category : "projects"
  end

  def normalized_explore_sort
    sort = params[:sort].to_s
    EXPLORE_SORTS.include?(sort) ? sort : "active"
  end

  # Live-refresh callers pass the count of entries currently rendered so the response replaces the
  # whole loaded slice. Capped to bound query cost when a user has scrolled deep.
  def normalized_explore_limit
    requested = params[:limit].to_i
    return EXPLORE_LIMIT if requested <= 0

    requested.clamp(1, EXPLORE_LIMIT_MAX)
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

  def apply_journal_cursor(scope, cursor)
    return scope if cursor.blank?

    cursor_at, cursor_id = decode_journal_cursor(cursor)
    scope.where("journal_entries.created_at < :cursor_at OR (journal_entries.created_at = :cursor_at AND journal_entries.id < :cursor_id)", cursor_at: cursor_at, cursor_id: cursor_id)
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

  def project_cursor_time(project, sort:)
    timestamp = sort == "newest" ? project.created_at : project_explore_activity_at(project)
    return nil if timestamp.blank?

    timestamp.respond_to?(:iso8601) ? timestamp : Time.zone.parse(timestamp.to_s)
  end

  def project_explore_activity_at(project)
    return unless project.has_attribute?("explore_activity_at")

    project.read_attribute("explore_activity_at").presence
  end

  def preload_project_explore_context(projects)
    project_ids = projects.map(&:id)
    @explore_journal_counts = JournalEntry.kept.where(project_id: project_ids).group(:project_id).count
    @explore_latest_entries = latest_entries_for_projects(project_ids)
    @explore_cover_entries = cover_entries_for_projects(project_ids)
  end

  def latest_entries_for_projects(project_ids)
    return {} if project_ids.empty?

    latest_ids = JournalEntry.public_for_explore
      .where(project_id: project_ids)
      .select("DISTINCT ON (journal_entries.project_id) journal_entries.id")
      .order("journal_entries.project_id, journal_entries.created_at DESC, journal_entries.id DESC")

    JournalEntry.where(id: latest_ids)
      .preload(:user, :project, images_attachments: :blob)
      .index_by(&:project_id)
  end

  def cover_entries_for_projects(project_ids)
    return {} if project_ids.empty?

    cover_ids = JournalEntry.public_for_explore
      .where(project_id: project_ids)
      .joins(:images_attachments)
      .select("DISTINCT ON (journal_entries.project_id) journal_entries.id")
      .order("journal_entries.project_id, journal_entries.created_at DESC, journal_entries.id DESC")

    JournalEntry.where(id: cover_ids)
      .preload(images_attachments: :blob)
      .index_by(&:project_id)
  end

  def serialize_project_for_explore(project)
    latest_entry = @explore_latest_entries[project.id]
    latest_markdown_doc = latest_entry && rendered_user_markdown_document(latest_entry.content.to_s)
    cover_entry = @explore_cover_entries[project.id]
    cover_url = if cover_entry
      url_for(cover_entry.images.first)
    elsif latest_entry
      journal_cover_url(latest_entry, latest_markdown_doc)
    end
    last_activity_at = project_explore_activity_at(project) || latest_entry&.created_at

    {
      id: project.id,
      type: "project",
      username: project.user.display_name,
      avatar_url: project.user.avatar,
      created_at: project.created_at.iso8601,
      last_activity_at: project_time_iso8601(last_activity_at),
      project_name: project.name,
      image: cover_url,
      project_description: project.description.to_s.truncate(160),
      latest_journal_excerpt: latest_markdown_doc ? plain_text_excerpt(latest_markdown_doc, 180) : nil,
      latest_journal_date: latest_entry&.created_at&.iso8601,
      journal_entries_count: @explore_journal_counts[project.id] || 0,
      tags: project.tags,
      href: "/projects/#{project.id}"
    }
  end

  def serialize_journal_for_explore(entry, markdown_doc)
    {
      id: entry.id,
      type: "journal",
      username: entry.user.display_name,
      avatar_url: entry.user.avatar,
      date: entry.created_at.iso8601,
      project_name: entry.project.name,
      excerpt: plain_text_excerpt(markdown_doc, 180),
      media: journal_media(entry, markdown_doc),
      tags: entry.project.tags,
      href: "/projects/#{entry.project_id}?journal_entry_id=#{entry.id}"
    }
  end

  def journal_media(entry, markdown_doc)
    if entry.images.attached?
      return {
        kind: "image",
        url: url_for(entry.images.first)
      }
    end

    markdown_image_url = journal_markdown_image_url(markdown_doc)
    return { kind: "image", url: markdown_image_url } if markdown_image_url

    entry.recordings.sort_by(&:created_at).each do |recording|
      media = recording_media(recording.recordable)
      return media if media
    end

    nil
  end

  def recording_media(recordable)
    case recordable
    when LapseTimelapse, LookoutTimelapse
      return nil unless recordable.playback_url.present?

      {
        kind: "video",
        url: recordable.playback_url,
        poster_url: recordable.thumbnail_url
      }
    when YouTubeVideo
      {
        kind: "youtube",
        thumbnail_url: recordable.thumbnail_url.presence || recordable.thumbnail_url_for(quality: "hqdefault")
      }
    end
  end

  def project_time_iso8601(timestamp)
    return nil if timestamp.blank?

    timestamp.respond_to?(:iso8601) ? timestamp.iso8601 : Time.zone.parse(timestamp.to_s).iso8601
  end

  def rendered_user_markdown_document(content)
    Nokogiri::HTML::DocumentFragment.parse(helpers.render_user_markdown(content))
  end

  def rendered_journal_markdown_documents(entries)
    entries.to_h { |entry| [ entry.id, rendered_user_markdown_document(entry.content.to_s) ] }
  end

  def preload_journal_recording_media(entries, markdown_docs)
    entries_for_recordings = entries.reject { |entry| journal_has_image_media?(entry, markdown_docs.fetch(entry.id)) }
    return if entries_for_recordings.empty?

    ActiveRecord::Associations::Preloader.new(
      records: entries_for_recordings,
      associations: { recordings: :recordable }
    ).call
  end

  def journal_cover_url(entry, markdown_doc)
    return url_for(entry.images.first) if entry.images.attached?

    journal_markdown_image_url(markdown_doc)
  end

  def journal_has_image_media?(entry, markdown_doc)
    entry.images.attached? || journal_markdown_image_url(markdown_doc).present?
  end

  def journal_markdown_image_url(markdown_doc)
    src = markdown_doc.at_css("img[src]")&.[]("src").presence
    return nil unless src
    # Reject protocol-relative URLs (//evil.example) — they bypass the host allowlist
    # and would cause the public explore feed to leak viewer IPs to attacker hosts.
    return nil if src.start_with?("//")
    # Allow only http(s) and same-origin paths; drop data:, javascript:, and other schemes
    # before the URL reaches <img src> on the public feed.
    return src if src.match?(%r{\Ahttps?://}i) || src.start_with?("/", "./", "../")

    nil
  end

  def meilisearch_project_ids(query)
    Project.ms_search(query, filter: "is_unlisted = false", sort: ["journal_count:desc", "created_at:desc"], limit: 500).map(&:id)
  end

  def meilisearch_journal_project_ids(query)
    JournalEntry.ms_search(query, sort: ["created_at:desc"], limit: 500).map(&:project_id).uniq
  end

  def plain_text_excerpt(markdown_doc, length)
    doc = markdown_doc.dup
    doc.css("img, .external-image-callout").remove
    doc.text.squish.truncate(length)
  end
end
