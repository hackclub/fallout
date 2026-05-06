class YouTubeVideoBackfillJob < ApplicationJob
  queue_as :background

  def perform
    YouTubeVideo.where(duration_seconds: nil).where(created_at: 7.days.ago..).find_each do |video|
      YouTubeVideoRefetchJob.perform_later(video.id)
    end
  end
end
