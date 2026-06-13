# frozen_string_literal: true

module ShipChecks
  module ReadmeExplainsHow
    DEFINITION = { key: :readme_explains_how, label: "README explains how to use and build it", deps: [ :readme_content ], visibility: :internal }.freeze

    def self.call(ctx)
      content = ctx.readme_content
      if content.nil?
        return ShipCheckService::CheckResult.new(
          key: "readme_explains_how", label: DEFINITION[:label],
          status: :skipped, message: "No README found", visibility: :internal
        )
      end

      chat = RubyLLM.chat
      response = chat.ask(<<~PROMPT)
        You are reviewing a hardware/electronics project README for a grant program.
        Does this README clearly explain HOW to use AND build the project? It should include detailed instructions so someone else could replicate it.

        README content (truncated):
        #{content.truncate(4000)}

        Respond with exactly one word — PASS or FAIL — followed by a dash and a brief reason (one sentence).
      PROMPT

      passed = response.content.strip.start_with?("PASS")
      message = response.content.strip.sub(/\A(PASS|FAIL)\s*[-—:]\s*/i, "")
      ShipCheckService::CheckResult.new(
        key: "readme_explains_how",
        label: DEFINITION[:label],
        status: passed ? :passed : :warn,
        message: passed ? nil : message,
        visibility: :internal
      )
    rescue StandardError
      ShipCheckService::CheckResult.new(
        key: "readme_explains_how", label: DEFINITION[:label],
        status: :skipped, message: "LLM analysis unavailable", visibility: :internal
      )
    end
  end
end
