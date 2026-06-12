class VerifyLapseArchiveJob < ApplicationJob
  queue_as :heavy # R2 HEAD/GET (and a full re-download when deep)

  def perform(lapse_timelapse_id, deep: false)
    lapse_timelapse = LapseTimelapse.find_by(id: lapse_timelapse_id)
    return unless lapse_timelapse&.archived_at # nothing archived to verify

    problems = LapseArchiveService.new.verify(lapse_timelapse, deep: deep)
    return if problems.empty?

    Rails.logger.error("[verify_lapse_archive] ##{lapse_timelapse.id} #{lapse_timelapse.lapse_timelapse_id}: #{problems.join('; ')}")
    ErrorReporter.capture_message("Lapse archive verification failed", level: :warning, contexts: {
      lapse_archive_verify: { id: lapse_timelapse.id, lapse_id: lapse_timelapse.lapse_timelapse_id, problems: problems }
    })
    problems
  end
end
