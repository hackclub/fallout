# frozen_string_literal: true

module ShipChecks
  # Batched LLM check — evaluates WHAT, HOW, and WHY in a single call.
  # Returns 3 CheckResults, one per aspect.
  module ReadmeQuality
    ASPECTS = [
      { key: :readme_explains_what, label: "README explains what the project is" },
      { key: :readme_explains_how, label: "README explains how to use/build it" },
      { key: :readme_explains_why, label: "README explains why it was made" }
    ].freeze

    DEFINITIONS = ASPECTS.map { |a| { key: a[:key], label: a[:label], deps: [ :readme_content ], visibility: :user } }.freeze

    def self.call(ctx)
      content = ctx.readme_content
      if content.nil?
        return ASPECTS.map do |a|
          ShipCheckService::CheckResult.new(
            key: a[:key].to_s, label: a[:label],
            status: :skipped, message: "No README found", visibility: :user
          )
        end
      end

      # Skip LLM call if README lacks basic formatting
      unless content.match?(/^\#{1,6}\s/m)
        return ASPECTS.map do |a|
          ShipCheckService::CheckResult.new(
            key: a[:key].to_s, label: a[:label],
            status: :skipped, message: "Skipped (README not formatted)", visibility: :user
          )
        end
      end

      chat = RubyLLM.chat(provider: :openrouter)
      response = chat.ask(<<~PROMPT)
        You are reviewing a hardware/electronics project README for a grant program.
        Evaluate the README on three criteria:

        1. WHAT: Does it explain what the project is, with a short description and what makes it unique?
        2. HOW: Does it explain how to use OR build the project, with enough detail to replicate it?
        3. WHY: Does it explain why it was made — personal motivation, a problem being solved, or a specific goal?

        README content (truncated):
        #{content.truncate(4000)}

        Respond with exactly three lines, one per criterion, in this format:
        WHAT: PASS
        HOW: PASS
        WHY: FAIL - short actionable fix only, no description of what's missing (e.g. "Add a section explaining your motivation for building this")
      PROMPT

      parse_response(response.content)
    rescue StandardError
      ASPECTS.map do |a|
        ShipCheckService::CheckResult.new(
          key: a[:key].to_s, label: a[:label],
          status: :skipped, message: "LLM analysis unavailable", visibility: :user
        )
      end
    end

    def self.parse_response(text)
      lines = text.strip.lines.map(&:strip)
      ASPECTS.map.with_index do |aspect, i|
        line = lines.find { |l| l.match?(/\A#{aspect[:key].to_s.split("_").last}:/i) } || lines[i] || ""
        passed = line.match?(/PASS/i)
        message = line.sub(/\A\w+:\s*(PASS|FAIL)\s*[-—:]\s*/i, "").strip
        ShipCheckService::CheckResult.new(
          key: aspect[:key].to_s,
          label: aspect[:label],
          status: passed ? :passed : :warn,
          message: passed ? nil : message.presence,
          visibility: :user
        )
      end
    end
  end
end
