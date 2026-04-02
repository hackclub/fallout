class TimelapseActivityCheckJob < ApplicationJob
  queue_as :heavy

  def perform(lookout_timelapse)
    result = TimelapseActivityChecker.new(lookout_timelapse).run

    lookout_timelapse.update!(
      inactive_frame_count: result[:inactive_frames],
      inactive_percentage: result[:inactive_percentage],
      inactive_segments: result[:segments],
      activity_checked_at: Time.current
    )
  end
end
