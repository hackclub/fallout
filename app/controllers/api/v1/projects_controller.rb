require "base64"

class Api::V1::ProjectsController < Api::V1::BaseController
  skip_before_action :authenticate_api_key!, only: %i[index show] # Public kept/listed project API.

  DEFAULT_LIMIT = 50
  MAX_LIMIT = 100

  def index
    scope = Project.kept.listed
    scope = scope.search(params[:query]) if params[:query].present?
    scope = apply_cursor(scope)

    projects = scope.order(created_at: :desc, id: :desc)
      .limit(limit + 1)
      .preload(:user, kept_journal_entries: { images_attachments: :blob })
      .to_a

    has_more = projects.size > limit
    projects = projects.first(limit)
    preload_project_counts(projects)

    render json: {
      data: projects.map { |project| serialize_project_summary(project) },
      pagination: {
        limit: limit,
        next_cursor: has_more ? encode_cursor(projects.last) : nil,
        has_more: has_more
      }
    }
  rescue ArgumentError
    render json: { error: "Invalid cursor" }, status: :bad_request
  end

  def show
    project = Project.kept.listed
      .preload(
        :user,
        :ships,
        collaborators: :user,
        kept_journal_entries: [
          :user,
          :collaborator_users,
          { recordings: :recordable },
          { images_attachments: :blob }
        ]
      )
      .find(params[:id])

    preload_project_counts([ project ])

    render json: {
      data: serialize_project_detail(project)
    }
  rescue ActiveRecord::RecordNotFound
    render json: { error: "Project not found" }, status: :not_found
  end

  private

  attr_reader :journal_entry_counts, :recording_counts, :time_logged

  def limit
    raw_limit = params[:limit].presence&.to_i || DEFAULT_LIMIT
    raw_limit.clamp(1, MAX_LIMIT)
  end

  def apply_cursor(scope)
    cursor = params[:cursor].to_s
    return scope if cursor.blank?

    created_at, id = decode_cursor(cursor)
    scope.where(
      "projects.created_at < :created_at OR (projects.created_at = :created_at AND projects.id < :id)",
      created_at: created_at,
      id: id
    )
  end

  def encode_cursor(project)
    return nil unless project

    Base64.urlsafe_encode64("#{project.created_at.iso8601(6)}|#{project.id}", padding: false)
  end

  def decode_cursor(cursor)
    created_at, id = Base64.urlsafe_decode64(cursor).split("|", 2)
    raise ArgumentError if created_at.blank? || id.blank?

    [ Time.iso8601(created_at), Integer(id) ]
  end

  def preload_project_counts(projects)
    project_ids = projects.map(&:id)
    @journal_entry_counts = JournalEntry.kept.where(project_id: project_ids).group(:project_id).count
    @recording_counts = Recording.joins(:journal_entry)
      .where(journal_entries: { project_id: project_ids, discarded_at: nil })
      .group("journal_entries.project_id")
      .count
    @time_logged = Project.batch_time_logged(project_ids)
  end

  def serialize_project_summary(project)
    {
      id: project.id,
      name: project.name,
      description: project.description,
      tags: project.tags,
      demo_link: project.demo_link,
      repo_link: project.repo_link,
      is_unlisted: project.is_unlisted,
      owner: serialize_user(project.user),
      cover_image_url: cover_image_url(project),
      journal_entries_count: journal_entry_counts[project.id] || 0,
      recordings_count: recording_counts[project.id] || 0,
      time_logged: time_logged[project.id] || 0,
      created_at: project.created_at.iso8601,
      updated_at: project.updated_at.iso8601
    }
  end

  def serialize_project_detail(project)
    serialize_project_summary(project).merge(
      collaborators: project.collaborators.map { |collaborator| serialize_user(collaborator.user) },
      journal_entries: project.kept_journal_entries
        .sort_by(&:created_at)
        .reverse
        .map { |entry| serialize_journal_entry(entry) },
      ships: project.ships.sort_by(&:created_at).reverse.map { |ship| serialize_ship(ship) }
    )
  end

  def serialize_journal_entry(journal_entry)
    {
      id: journal_entry.id,
      project_id: journal_entry.project_id,
      content: journal_entry.content.to_s,
      content_html: ApplicationController.helpers.render_user_markdown(journal_entry.content.to_s),
      images: journal_entry.images.map { |image| image_url(image) },
      recordings_count: journal_entry.recordings.size,
      time_logged: recordings_time_logged(journal_entry.recordings),
      author: serialize_user(journal_entry.user),
      collaborators: journal_entry.collaborator_users.map { |user| serialize_user(user) },
      created_at: journal_entry.created_at.iso8601,
      updated_at: journal_entry.updated_at.iso8601
    }
  end

  def serialize_ship(ship)
    {
      id: ship.id,
      status: ship.status,
      feedback: ship.feedback,
      created_at: ship.created_at.iso8601,
      updated_at: ship.updated_at.iso8601
    }
  end

  def serialize_user(user)
    {
      display_name: user.display_name,
      avatar: user.avatar
    }
  end

  def cover_image_url(project)
    cover_entry = project.kept_journal_entries
      .select { |entry| entry.images.attached? }
      .max_by(&:created_at)

    cover_entry && image_url(cover_entry.images.first)
  end

  def image_url(image)
    Rails.application.routes.url_helpers.rails_blob_url(
      image,
      host: request.host_with_port,
      protocol: request.protocol
    )
  end

  def recordings_time_logged(recordings)
    recordings.sum do |recording|
      recordable = recording.recordable
      if recordable.is_a?(YouTubeVideo)
        recordable.duration_seconds.to_i * (recordable.stretch_multiplier || 1)
      elsif recordable.respond_to?(:duration_seconds)
        recordable.duration_seconds.to_i
      else
        recordable.duration.to_i
      end
    end
  end
end
