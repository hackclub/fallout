# frozen_string_literal: true

module ShipChecks
  # Batched LLM check — evaluates 3D model/build and PCB/wiring in a single call.
  # Returns 2 CheckResults.
  module ImagesShowHardware
    ASPECTS = [
      { key: :images_show_3d_model, label: "README shows 3D model or completed build" },
      { key: :images_show_pcb, label: "README shows PCB or wiring" }
    ].freeze

    DEFINITIONS = ASPECTS.map { |a| { key: a[:key], label: a[:label], deps: [ :image_descriptions ], visibility: :user } }.freeze

    def self.call(ctx)
      descriptions = ctx.image_descriptions
      if descriptions.nil? || descriptions.empty?
        return ASPECTS.map do |a|
          ShipCheckService::CheckResult.new(
            key: a[:key].to_s, label: a[:label],
            status: :skipped, message: "No image descriptions available", visibility: :user
          )
        end
      end

      # Skip LLM call if README doesn't have enough images
      content = ctx.readme_content
      readme_images = content&.scan(/!\[.*?\]\(.*?\)|<img[\s>]/i)&.size || 0
      tree_images = ctx.repo_tree&.count { |p| p.match?(/\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i) } || 0
      unless readme_images >= 2 || tree_images >= 2
        return ASPECTS.map do |a|
          ShipCheckService::CheckResult.new(
            key: a[:key].to_s, label: a[:label],
            status: :skipped, message: "Skipped (not enough images)", visibility: :user
          )
        end
      end

      numbered = descriptions.map.with_index(1) { |d, i| "#{i}. #{d}" }.join("\n")

      chat = RubyLLM.chat(provider: :openrouter)
      response = chat.ask(<<~PROMPT)
        You are reviewing a hardware project submission. Based on these image descriptions from the project's README, evaluate two criteria:

        1. BUILD: Does at least one image show a 3D model, render, or photo of the completed build in real life?
        2. PCB: Does at least one image show a PCB layout, PCB with components, or wiring diagram?

        Image descriptions:
        #{numbered}

        Respond with exactly two lines in this format:
        BUILD: PASS - reason
        PCB: FAIL - actionable suggestion for what to add (e.g. "Add a photo of your PCB or wiring to your README")
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
      keywords = %w[BUILD PCB]
      ASPECTS.map.with_index do |aspect, i|
        line = lines.find { |l| l.match?(/\A#{keywords[i]}:/i) } || lines[i] || ""
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
