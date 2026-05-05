class PostCheckpointThreadJob < ApplicationJob
  queue_as :default

  rescue_from(StandardError) do |exception|
    Rails.logger.error(
      "PostCheckpointThreadJob failed: #{exception.class}: #{exception.message} " \
      "(job_id=#{job_id}, arguments=#{arguments.inspect})"
    )
    ErrorReporter.capture_exception(
      exception,
      contexts: {
        post_checkpoint_thread_job: {
          job_id: job_id,
          arguments: arguments
        }
      }
    )
    raise exception
  end

  def perform(message_ts:, ship_id:, review_type:, review_status:, base_url:, project_url:, repo_url:)
    ship = Ship.includes(
      :time_audit_review,
      :requirements_check_review,
      :design_review,
      :build_review,
      project: { user: {}, ships: [ :requirements_check_review, :design_review ] }
    ).find(ship_id)

    cover_image_url = ReviewCardImageService.call(
      project: ship.project,
      review_type: review_type,
      review_status: review_status,
      base_url: base_url
    )

    SlackCheckpointService.post_review_thread(
      message_ts: message_ts,
      ship: ship,
      review_type: review_type,
      review_status: review_status,
      cover_image_url: cover_image_url,
      project_url: project_url,
      repo_url: repo_url,
      base_url: base_url
    )
  end
end
