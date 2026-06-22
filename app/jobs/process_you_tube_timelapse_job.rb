class ProcessYouTubeTimelapseJob < ApplicationJob
  queue_as :heavy # yt-dlp download + ffmpeg transcode + hashing, like ArchiveLapseTimelapseJob

  def perform(you_tube_video_id, force: false)
    video = YouTubeVideo.find_by(id: you_tube_video_id)
    return unless video # row deleted before the job ran

    YouTubeTimelapseService.new.process!(video, force: force)
  rescue YouTubeTimelapseService::Unavailable => e
    # Private/deleted/bot-blocked — expected. The service already set processing_status: :failed
    # with the reason; the video keeps its YouTube-iframe fallback and an admin can re-run later.
    Rails.logger.info("ProcessYouTubeTimelapseJob: video ##{you_tube_video_id} unavailable (#{e.reason}): #{e.message}")
  end
end
