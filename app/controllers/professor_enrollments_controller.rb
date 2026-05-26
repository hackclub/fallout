# frozen_string_literal: true

class ProfessorEnrollmentsController < ApplicationController
  skip_after_action :verify_authorized # No index action — blanket skip required (Rails 8.1 callback validation)
  skip_after_action :verify_policy_scoped # No index action — blanket skip required (Rails 8.1 callback validation)

  # Per-user limit so a logged-in attacker can't amplify our endpoint into a DoS against the
  # Professor API (the secret is server-side, so this is the only path to it). Modal requests
  # need an Inertia-friendly response so the dialog can surface the error rather than try to
  # follow a redirect.
  rate_limit to: 5, within: 5.minutes, only: :create,
    by: -> { current_user&.id || request.remote_ip },
    with: -> {
      if request.headers["X-InertiaUI-Modal"].present?
        head :too_many_requests
      else
        redirect_back fallback_location: bulletin_board_path,
          alert: "Too many attempts. Please try again in a few minutes."
      end
    }

  # Renders the confirmation modal (or standalone page if accessed directly). Defaults inherited
  # from ApplicationController already require a full HCA-linked user, so trial / unauthenticated
  # callers never reach this action.
  def new
    skip_authorization # No authorizable resource; eligibility checked manually below.

    unless current_user.professor_enrollment_eligible?
      redirect_to bulletin_board_path, alert: "You need a full Hack Club account with a linked Slack to sign up for a mentor."
      return
    end

    if current_user.professor_enrolled?
      redirect_to bulletin_board_path, notice: "You're already signed up — wait ~24h to be added to the Slack channel."
      return
    end

    render inertia: "professor_enrollments/new", props: {
      is_modal: request.headers["X-InertiaUI-Modal"].present?
    }
  end

  def create
    skip_authorization # No authorizable resource; eligibility checked manually below.

    # Defense in depth — UI hides the button for ineligible users, but the endpoint must also
    # refuse trial users / users without a slack_id (the Professor API needs the Slack ID).
    unless current_user.professor_enrollment_eligible?
      return head :forbidden if modal_request?

      redirect_to bulletin_board_path,
        alert: "You need a full Hack Club account with a linked Slack to sign up for a mentor."
      return
    end

    if current_user.professor_enrolled?
      return head :no_content if modal_request?

      redirect_back fallback_location: bulletin_board_path,
        notice: "You're already signed up — wait ~24h to be added to the Slack channel."
      return
    end

    if ProfessorService.manual_add(slack_id: current_user.normalized_slack_id)
      current_user.update!(professor_enrolled_at: Time.current)
      return head :no_content if modal_request?

      redirect_to bulletin_board_path,
        notice: "You're signed up for a mentor — wait ~24h to be added to the Slack channel."
    else
      return head :unprocessable_entity if modal_request?

      redirect_back fallback_location: bulletin_board_path,
        alert: "Something went wrong signing you up. Please try again in a bit."
    end
  rescue ProfessorService::ConfigError => e
    ErrorReporter.capture_exception(e, level: :error, contexts: { professor: { action: "create" } })
    return head :service_unavailable if modal_request?

    redirect_back fallback_location: bulletin_board_path,
      alert: "Mentor signup is temporarily unavailable. Please try again later."
  end

  private

  def modal_request?
    request.headers["X-InertiaUI-Modal"].present?
  end
end
