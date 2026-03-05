# frozen_string_literal: true

class OnboardingController < ApplicationController
  allow_trial_access only: %i[show update] # Both trial and full users complete onboarding
  skip_before_action :redirect_to_onboarding!, only: %i[show update] # This IS the onboarding destination
  skip_after_action :verify_authorized # No authorizable resource on any action
  skip_after_action :verify_policy_scoped # No index action; no policy-scoped queries

  def show
    return redirect_to dashboard_path if current_user.onboarded?

    step = current_step
    return complete_onboarding if step.nil?

    step_index = OnboardingConfig.step_keys.index(step["key"])
    existing = current_user.onboarding_responses.find_by(question_key: step["key"])

    render inertia: {
      step: step,
      step_index: step_index,
      total_steps: OnboardingConfig.step_count,
      existing_answer: existing&.then { |r| { answer_text: r.answer_text, is_other: r.is_other } }
    }
  end

  def update
    return redirect_to dashboard_path if current_user.onboarded?

    step = OnboardingConfig.find_step(params[:question_key])
    unless step
      redirect_to onboarding_path, alert: "Invalid step."
      return
    end

    unless step["type"] == "dialogue"
      answer_text = params[:answer_text].to_s
      is_other = params[:is_other] == true || params[:is_other] == "true"

      if step["options"].present? && !is_other
        valid_answers = step["type"] == "multi_choice" ? (JSON.parse(answer_text) rescue []) : [ answer_text ]
        unless valid_answers.all? { |a| step["options"].include?(a) }
          redirect_to onboarding_path, alert: "Invalid answer."
          return
        end
      end

      if is_other && !step["allow_other"]
        redirect_to onboarding_path, alert: "Invalid answer."
        return
      end

      response = current_user.onboarding_responses.find_or_initialize_by(question_key: step["key"])
      response.answer_text = answer_text
      response.is_other = is_other

      unless response.save
        redirect_to onboarding_path, inertia: { errors: response.errors.messages }
        return
      end
    else
      current_user.onboarding_responses.find_or_create_by!(question_key: step["key"])
    end

    if last_step?(step["key"])
      complete_onboarding
    else
      redirect_to onboarding_path
    end
  end

  private

  def current_step
    answered_keys = current_user.onboarding_responses.pluck(:question_key)
    OnboardingConfig.steps.find { |s| answered_keys.exclude?(s["key"]) }
  end

  def last_step?(key)
    OnboardingConfig.step_keys.last == key
  end

  def complete_onboarding
    current_user.update!(onboarded: true)
    redirect_to dashboard_path, notice: "Welcome to the dashboard!"
  end
end
