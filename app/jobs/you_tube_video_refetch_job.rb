class YouTubeVideoRefetchJob < ApplicationJob
  queue_as :default
  discard_on YouTubeService::Error do |job, error|
    ErrorReporter.capture_exception(error, level: :info, contexts: { youtube: { action: "refetch_job", video_id: job.arguments.first } })
  end
  retry_on StandardError, wait: :polynomially_longer, attempts: 5 do |job, error|
    ErrorReporter.capture_exception(error, level: :warning, contexts: { youtube: { action: "refetch_job", video_id: job.arguments.first } })
  end

  def perform(video_id)
    video = YouTubeVideo.find_by(id: video_id)
    return if video.nil? || video.duration_seconds.present?

    video.refetch_data!
  end
end
