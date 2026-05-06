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
    return unless video

    video.refetch_data! if video.duration_seconds.nil?
    return unless video.duration_seconds.present?

    recording = video.recording
    return unless recording
    return unless recording.journal_entry

    tz = ActiveSupport::TimeZone[recording.user.timezone] || ActiveSupport::TimeZone["UTC"]
    date = recording.journal_entry.created_at.in_time_zone(tz).to_date
    StreakService.record_activity(recording.user, date: date)
    StreakService.repair_frozen_day(recording.user, recording.journal_entry)
  end
end
