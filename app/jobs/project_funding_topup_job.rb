# frozen_string_literal: true

class ProjectFundingTopupJob < ApplicationJob
  queue_as :background

  def perform(user_id, triggering_order_id: nil)
    user = User.find(user_id)
    order = ProjectGrantOrder.find_by(id: triggering_order_id) if triggering_order_id
    ProjectFundingTopupService.settle!(user, triggering_order: order)
  end
end
