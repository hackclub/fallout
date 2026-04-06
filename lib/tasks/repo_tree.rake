# frozen_string_literal: true

namespace :repo_tree do
  desc "Backfill repo_tree for requirements check reviews with GitHub repos"
  task backfill: :environment do
    reviews = RequirementsCheckReview
      .joins(ship: :project)
      .where(repo_tree: nil)
      .where("projects.repo_link LIKE ?", "%github.com%")

    puts "Found #{reviews.count} reviews to backfill"

    reviews.find_each do |review|
      FetchRepoTreeJob.perform_later(review.id)
      puts "  Enqueued FetchRepoTreeJob for review ##{review.id} (#{review.ship.project.name})"
    end

    puts "Done — jobs enqueued"
  end
end
