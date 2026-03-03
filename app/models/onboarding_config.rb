# frozen_string_literal: true

class OnboardingConfig
  STEPS = YAML.safe_load_file(Rails.root.join("config", "onboarding.yml")).fetch("steps").freeze

  def self.steps
    Rails.env.development? ? load_steps : STEPS
  end

  def self.step_keys = steps.map { |s| s["key"] }
  def self.find_step(key) = steps.find { |s| s["key"] == key }
  def self.step_count = steps.size

  def self.load_steps
    YAML.safe_load_file(Rails.root.join("config", "onboarding.yml")).fetch("steps")
  end

  private_class_method :load_steps
end
