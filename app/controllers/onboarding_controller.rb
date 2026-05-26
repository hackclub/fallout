# frozen_string_literal: true

class OnboardingController < ApplicationController
  allow_trial_access only: %i[show update] # Both trial and full users complete onboarding
  skip_before_action :redirect_to_onboarding!, only: %i[show update] # This IS the onboarding destination
  skip_after_action :verify_authorized # No authorizable resource on any action
  skip_after_action :verify_policy_scoped # No index action; no policy-scoped queries

  def show
    return redirect_to path_path if current_user.onboarded?

    step = requested_step || current_step
    return complete_onboarding if step.nil?

    step_index = OnboardingConfig.step_keys.index(step["key"])
    existing = current_user.onboarding_responses.find_by(question_key: step["key"])

    prev_key = step_index.positive? ? OnboardingConfig.step_keys[step_index - 1] : nil

    render inertia: {
      step: step,
      step_index: step_index,
      total_steps: OnboardingConfig.step_count,
      existing_answer: existing&.then { |r| { answer_text: r.answer_text, is_other: r.is_other } },
      prev_step_key: prev_key
    }
  end

  def update
    return redirect_to path_path if current_user.onboarded?

    step = OnboardingConfig.find_step(params[:question_key])
    unless step
      redirect_to onboarding_path, alert: "Invalid step."
      return
    end

    case step["type"]
    when "dialogue"
      current_user.onboarding_responses.find_or_create_by!(question_key: step["key"])
    when "professor_enrollment_cta"
      action_taken = params[:action_taken].to_s
      unless %w[enrolled skipped].include?(action_taken)
        redirect_to onboarding_path, alert: "Invalid answer."
        return
      end

      # "enrolled" hits the Professor API for eligible (non-trial + slack_id) users; on success we
      # stamp professor_enrolled_at. On API failure or for ineligible users (trial users without a
      # slack_id yet, or the rare verified user without one), we preserve the "enrolled" intent and
      # leave professor_enrolled_at nil — the bulletin board CTA stays visible so the user can retry
      # without seeing a misleading "skipped" state. AuthController#create re-attempts trial users'
      # enrollment after HCA promotion populates slack_id, reading the same intent record.
      if action_taken == "enrolled" && current_user.professor_enrollment_eligible? && !current_user.professor_enrolled?
        begin
          if ProfessorService.manual_add(slack_id: current_user.normalized_slack_id)
            current_user.update!(professor_enrolled_at: Time.current)
          end
        rescue ProfessorService::ConfigError => e
          ErrorReporter.capture_exception(e, level: :error, contexts: { professor: { action: "onboarding_update" } })
        end
      end

      response = current_user.onboarding_responses.find_or_initialize_by(question_key: step["key"])
      response.answer_text = action_taken
      response.is_other = false
      unless response.save
        redirect_to onboarding_path, inertia: { errors: response.errors.messages }
        return
      end
    else
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
    end

    if last_step?(step["key"])
      complete_onboarding
    else
      next_key = OnboardingConfig.step_keys[OnboardingConfig.step_keys.index(step["key"]) + 1]
      redirect_to onboarding_path(step: next_key)
    end
  end

  private

  # Allows navigating to a previously answered step or the next reachable step via ?step= param
  def requested_step
    return unless params[:step]

    step = OnboardingConfig.find_step(params[:step])
    return unless step

    step_index = OnboardingConfig.step_keys.index(step["key"])
    answered_keys = current_user.onboarding_responses.pluck(:question_key)

    # Allow if this step is answered (revisiting) or the previous step is answered (advancing)
    step if answered_keys.include?(step["key"]) || (step_index.zero? || answered_keys.include?(OnboardingConfig.step_keys[step_index - 1]))
  end

  def current_step
    answered_keys = current_user.onboarding_responses.pluck(:question_key)
    OnboardingConfig.steps.find { |s| answered_keys.exclude?(s["key"]) }
  end

  def last_step?(key)
    OnboardingConfig.step_keys.last == key
  end

  def complete_onboarding
    current_user.update!(onboarded: true)
    # If the user arrived via a collaboration invite link, nudge them toward the mailbox
    if session[:return_to]&.start_with?("/i/")
      redirect_to path_path, notice: "Click on the letter in the top right to accept your invite!"
    else
      redirect_to path_path, notice: "Welcome to the path!"
    end
  end
end
