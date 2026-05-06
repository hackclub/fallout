# frozen_string_literal: true

module ShipChecks
  module RepoIsPublic
    DEFINITION = { key: :repo_is_public, label: "Repository is public", deps: [ :repo_meta ], visibility: :user }.freeze

    def self.call(ctx)
      if ctx.project.repo_link.blank?
        return ShipCheckService::CheckResult.new(
          key: "repo_is_public", label: DEFINITION[:label],
          status: :skipped, message: "No repository link provided", visibility: :user
        )
      end

      # Non-GitHub repos (GitLab, self-hosted, etc.) can't be checked via the GitHub API
      if ctx.non_github_repo?
        return ShipCheckService::CheckResult.new(
          key: "repo_is_public", label: DEFINITION[:label],
          status: :skipped, message: "Skipped (non-GitHub repository)", visibility: :user
        )
      end

      if ctx.github_rate_limited?
        return ShipCheckService::CheckResult.new(
          key: "repo_is_public", label: DEFINITION[:label],
          status: :warn, message: "GitHub rate limit reached — please try again in a moment", visibility: :user
        )
      end

      passed = ctx.repo_meta.present?
      ShipCheckService::CheckResult.new(
        key: "repo_is_public",
        label: DEFINITION[:label],
        status: passed ? :passed : :failed,
        message: passed ? nil : "Repository is not accessible — make sure it exists and is public",
        visibility: :user
      )
    end
  end
end
