# frozen_string_literal: true

# Headless policy for the reviewer Slack app. Only Phase 2 reviewers (and admins) post
# DR/BR feedback to #fallout-checkpoint, so only they may link it or search mention targets.
class ReviewerSlackPolicy < ApplicationPolicy
  def connect?
    phase_two_reviewer?
  end

  def mentions?
    phase_two_reviewer?
  end

  private

  def phase_two_reviewer?
    user.present? && (user.can_review?(:design_review) || user.can_review?(:build_review))
  end
end
