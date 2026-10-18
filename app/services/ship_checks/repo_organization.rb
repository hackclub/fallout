# frozen_string_literal: true

module ShipChecks
  module RepoOrganization
    DEFINITION = { key: :repo_organization, label: "Repository is organized", deps: [ :repo_tree ], visibility: :user }.freeze

    def self.call(ctx)
      tree = ctx.repo_tree
      if tree.nil?
        msg = ctx.non_github_repo? ? "Skipped (non-GitHub repository)" : "Repository not accessible"
        return ShipCheckService::CheckResult.new(
          key: "repo_organization", label: DEFINITION[:label],
          status: :skipped, message: msg, visibility: :user
        )
      end

      chat = RubyLLM.chat(provider: :openrouter)
      response = chat.ask(<<~PROMPT)
        You are reviewing a hardware/electronics project repository for a grant program.
        The repository should make sense to a reasonable person. Don't be too strict about following conventions, but folders should be named and grouped logically - not dumped in the root directory or one folder.

        File tree:
        #{tree.first(200).join("\n")}

        Respond with exactly PASS or FAIL followed by a dash and an actionable suggestion (e.g. "Organize your files into folders like firmware/, pcb/, and docs/").
      PROMPT

      passed = response.content.strip.start_with?("PASS")
      message = response.content.strip.sub(/\A(PASS|FAIL)\s*[-—:]\s*/i, "")
      ShipCheckService::CheckResult.new(
        key: "repo_organization",
        label: DEFINITION[:label],
        status: passed ? :passed : :warn,
        message: passed ? nil : message,
        visibility: :user
      )
    rescue StandardError
      ShipCheckService::CheckResult.new(
        key: "repo_organization", label: DEFINITION[:label],
        status: :skipped, message: "LLM analysis unavailable", visibility: :user
      )
    end
  end
end
