# frozen_string_literal: true

class FetchRepoTreeJob < ApplicationJob
  queue_as :background

  def perform(review_id)
    review = RequirementsCheckReview.find_by(id: review_id)
    return unless review # Review may have been deleted between enqueue and execution

    repo_link = review.ship.project.repo_link

    match = repo_link&.match(%r{github\.com/([^/]+)/([^/]+?)(?:\.git)?(?:/|$)})
    return unless match

    tree = GithubService.repo_tree(match[1], match[2])
    review.update_columns(repo_tree: tree) if tree # Don't overwrite existing data with nil on API failure
  end
end
