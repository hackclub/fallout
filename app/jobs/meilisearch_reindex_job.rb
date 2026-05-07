class MeilisearchReindexJob < ApplicationJob
  queue_as :meilisearch

  # Retry transient connection errors a few times with backoff, then discard
  retry_on Meilisearch::CommunicationError, wait: :polynomially_longer, attempts: 5
  discard_on Meilisearch::ApiError

  def perform(model_class_name, record_id)
    record = model_class_name.constantize.find_by(id: record_id)
    return unless record

    if record.respond_to?(:discarded?) && record.discarded?
      record.remove_from_index!
    else
      record.ms_index!
    end
  end
end
