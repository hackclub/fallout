class YouTubeVideoRefetchJob < ApplicationJob
  queue_as :default

  def perform(video_id)
    video = YouTubeVideo.find_by(id: video_id)
    return if video.nil? || video.duration_seconds.present?

    video.refetch_data!
  rescue StandardError => e
    ErrorReporter.capture_exception(e, level: :warning, contexts: { youtube: { action: "refetch_job", video_id: video_id } })
  end
end
