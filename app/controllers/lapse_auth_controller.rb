class LapseAuthController < ApplicationController
  include OauthState

  skip_onboarding_redirect only: %i[start callback] # OAuth flow must complete regardless of onboarding state
  skip_after_action :verify_authorized # No authorizable resource on any action
  skip_after_action :verify_policy_scoped # No index action; no policy-scoped queries
  rate_limit to: 10, within: 3.minutes, only: :callback, with: -> { redirect_to root_path, alert: "Try again later." }

  def start
    state = SecureRandom.hex(24)
    code_verifier = SecureRandom.hex(32)
    code_challenge = Base64.urlsafe_encode64(Digest::SHA256.digest(code_verifier), padding: false)

    # Store state-to-verifier pairs in a single cookie so concurrent tabs each
    # keep their own PKCE verifier (same multi-state pattern as AuthController).
    existing = Hash(cookies.encrypted[:lapse_oauth]).to_a.last(4)
    set_oauth_cookie(:lapse_oauth, existing.to_h.merge(state => code_verifier))
    if params[:return_to].present?
      session[:lapse_return_to] = params[:return_to]
      session[:lapse_return_project_id] = params[:project_id] if params[:project_id].present?
    end

    redirect_to LapseService.authorize_url(lapse_callback_url, state, code_challenge: code_challenge), allow_other_host: true
  end

  def callback
    oauth_pairs = Hash(cookies.encrypted[:lapse_oauth])
    code_verifier = oauth_pairs[params[:state]]
    delete_oauth_cookie(:lapse_oauth)

    unless code_verifier
      ErrorReporter.capture_message("Lapse CSRF validation failed", level: :error, contexts: {
        lapse_auth: { had_states: oauth_pairs.any?, received_state: params[:state] }
      })
      redirect_to root_path, alert: "Lapse authentication failed due to CSRF token mismatch"
      return
    end

    token_data = LapseService.exchange_code_for_token(params[:code], lapse_callback_url, code_verifier: code_verifier)
    unless token_data&.dig("access_token")
      redirect_to root_path, alert: "Failed to connect Lapse account"
      return
    end

    current_user.update!(lapse_token: token_data["access_token"])
    return_to = session.delete(:lapse_return_to)
    return_project_id = session.delete(:lapse_return_project_id)
    redirect_path = if return_to == "journal"
      path_path(open: "journal", project_id: return_project_id)
    else
      root_path
    end
    redirect_to redirect_path, notice: "Lapse account connected successfully!"
  rescue StandardError => e
    ErrorReporter.capture_exception(e)
    redirect_to root_path, alert: "Failed to connect Lapse account"
  end
end
