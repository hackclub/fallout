# frozen_string_literal: true

module ShipChecks
  module ImagesShowPcb
    DEFINITION = { key: :images_show_pcb, label: "README shows PCB or wiring", deps: [ :image_descriptions ], visibility: :internal }.freeze

    def self.call(ctx)
      descriptions = ctx.image_descriptions
      if descriptions.nil? || descriptions.empty?
        return ShipCheckService::CheckResult.new(
          key: "images_show_pcb", label: DEFINITION[:label],
          status: :skipped, message: "No image descriptions available", visibility: :internal
        )
      end

      chat = RubyLLM.chat(provider: :openrouter)
      response = chat.ask(<<~PROMPT)
        You are reviewing a hardware project submission. Based on these image descriptions from the project's README, does at least one image show either:
        - A PCB layout or PCB with components, OR
        - A wiring diagram (if the project doesn't use a PCB) OR
        - Assembly or prototype photos that clearly show the wiring and components

        Image descriptions:
        #{descriptions.map.with_index(1) { |d, i| "#{i}. #{d}" }.join("\n")}

        Respond with exactly PASS or FAIL followed by a dash and a brief reason (one sentence).
      PROMPT

      parse_llm_result(response)
    rescue StandardError
      ShipCheckService::CheckResult.new(
        key: "images_show_pcb", label: DEFINITION[:label],
        status: :skipped, message: "LLM analysis unavailable", visibility: :internal
      )
    end

    def self.parse_llm_result(response)
      passed = response.content.strip.start_with?("PASS")
      message = response.content.strip.sub(/\A(PASS|FAIL)\s*[-—:]\s*/i, "")
      ShipCheckService::CheckResult.new(
        key: "images_show_pcb",
        label: DEFINITION[:label],
        status: passed ? :passed : :warn,
        message: passed ? nil : message,
        visibility: :internal
      )
    end
  end
end
