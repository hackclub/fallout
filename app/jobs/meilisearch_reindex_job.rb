class MeilisearchReindexJob < ApplicationJob
  queue_as :default

  def perform(model_class_name, record_id)
    record = model_class_name.constantize.find_by(id: record_id)
    return unless record

    if record.respond_to?(:discarded?) && record.discarded?
      record.remove_from_index! rescue MeiliSearch::ApiError
    else
      record.ms_index!
    end
  end
end
