# frozen_string_literal: true

RubyLLM.configure do |config|
  config.openrouter_api_key = ENV.fetch("OPENROUTER_API_KEY", nil)
  config.default_model = "openai/gpt-5-nano"
end
