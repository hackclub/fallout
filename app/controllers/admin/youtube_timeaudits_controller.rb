class Admin::YoutubeTimeauditsController < Admin::ApplicationController
  # Admin-only tooling: trigger yt-dlp → 60× timelapse processing of YouTube footage so it audits
  # like Lapse/Lookout. Unlisted (not in AdminSidebar). require_admin! is blanket/restricting so a
  # forgotten action still fails closed. Already inside the AdminConstraint routing block as well.
  before_action :require_admin!

  # In-flight statuses an admin shouldn't double-enqueue over during a "process all".
  ACTIVE_STATUSES = %w[pending downloading transcoding uploading].freeze
  PROCESSABLE_STATUSES = %w[unqueued failed].freeze

  def index
    skip_policy_scope # admin-only tooling list; no per-user scoping applies
    render inertia: "admin/youtube_timeaudit/index", props: {
      videos: serialized_videos
    }
  end

  # Polled by the dashboard for live per-video progress.
  def status
    skip_authorization
    payload = YouTubeVideo.where(id: queue_video_ids).order(:id).map do |video|
      {
        id: video.id,
        processing_status: video.processing_status, # enum accessor → string label (NOT pluck, which we'd have to re-map)
        processing_progress: video.processing_progress,
        processing_error: video.processing_error,
        processed_at: video.processed_at&.iso8601,
        timelapse_ready: video.timelapse_ready?
      }
    end
    render json: { videos: payload }
  end

  # Enqueue (re)processing of a single video.
  def process_video
    skip_authorization
    video = YouTubeVideo.find(params[:id])
    enqueue!(video, force: true)
    render json: { ok: true }
  rescue ActiveRecord::RecordNotFound
    render json: { error: "Not found" }, status: :not_found
  end

  # Enqueue every queued video that isn't already processed or currently in flight.
  def process_all
    skip_authorization
    candidates = YouTubeVideo.where(id: queue_video_ids)
      .where(processing_status: YouTubeVideo.processing_statuses.values_at(*PROCESSABLE_STATUSES))
      .order(created_at: :asc)
    candidates.each { |video| enqueue!(video, force: false) }
    render json: { ok: true, enqueued: candidates.size }
  end

  private

  # YouTube videos belonging to ships whose time audit is still PENDING — the live review queue.
  # Excludes videos from already-completed audits (a video audited once never needs reprocessing;
  # if it carries forward into a new ship it's already timelapse_ready and shows as "Ready").
  def queue_video_ids
    YouTubeVideo
      .joins(recording: { journal_entry: { ship: :time_audit_review } })
      .merge(TimeAuditReview.pending)
      .distinct
      .pluck(:id)
  end

  def enqueue!(video, force:)
    # Reflect "queued" immediately so the dashboard shows movement before the worker picks it up.
    video.update_columns(processing_status: YouTubeVideo.processing_statuses["pending"],
                         processing_progress: 0, processing_error: nil)
    ProcessYouTubeTimelapseJob.perform_later(video.id, force: force)
  end

  def serialized_videos
    YouTubeVideo
      .where(id: queue_video_ids)
      .includes(recording: { journal_entry: [ :project, :user, { ship: :time_audit_review } ] })
      .order(created_at: :desc)
      .map do |video|
        entry = video.recording&.journal_entry
        project = entry&.project
        review = entry&.ship&.time_audit_review
        {
          id: video.id,
          title: video.title.presence || video.video_id,
          video_id: video.video_id,
          thumbnail_url: video.thumbnail_url.presence || video.thumbnail_url_for(quality: "mqdefault"),
          duration_seconds: video.duration_seconds,
          processing_status: video.processing_status,
          processing_progress: video.processing_progress,
          processing_error: video.processing_error,
          processed_at: video.processed_at&.iso8601,
          timelapse_ready: video.timelapse_ready?,
          project_name: project&.name,
          author_name: entry&.user&.display_name,
          time_audit_path: review ? admin_reviews_time_audit_path(review) : nil
        }
      end
  end
end
