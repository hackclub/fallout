class SlackAuthController < ApplicationController
  include OauthState

  skip_onboarding_redirect only: %i[start callback] # OAuth flow must complete regardless of onboarding state
  skip_after_action :verify_authorized # No authorizable resource on any action
  skip_after_action :verify_policy_scoped # No index action; no policy-scoped queries
  rate_limit to: 10, within: 3.minutes, only: :callback, with: -> { redirect_to root_path, alert: "Try again later." }

  def start
    state = SecureRandom.hex(24)
    existing = Hash(cookies.encrypted[:slack_oauth]).to_a.last(4)
    set_oauth_cookie(:slack_oauth, existing.to_h.merge(state => true))
    redirect_to slack_authorize_url(state), allow_other_host: true
  end

  def callback
    oauth_states = Hash(cookies.encrypted[:slack_oauth])
    delete_oauth_cookie(:slack_oauth)

    unless oauth_states.key?(params[:state])
      ErrorReporter.capture_message("Slack CSRF validation failed", level: :error, contexts: {
        slack_auth: { had_states: oauth_states.any?, received_state: params[:state] }
      })
      redirect_to profile_path, alert: "Slack authorization failed."
      return
    end

    if params[:error].present?
      redirect_to profile_path, alert: "Slack authorization was cancelled."
      return
    end

    token_data = exchange_slack_code(params[:code])
    unless token_data&.dig("authed_user", "access_token")
      redirect_to profile_path, alert: "Failed to connect Slack."
      return
    end

    current_user.update!(slack_token: token_data.dig("authed_user", "access_token"))
    redirect_to path_path, notice: "Slack connected! Click \"Set as Slack\" to update your photo."
  rescue StandardError => e
    ErrorReporter.capture_exception(e)
    redirect_to profile_path, alert: "Failed to connect Slack."
  end

  private

  def slack_authorize_url(state)
    params = {
      client_id: ENV.fetch("SLACK_CLIENT_ID", nil),
      user_scope: "users.profile:write",
      redirect_uri: slack_callback_url,
      state: state
    }
    "https://slack.com/oauth/v2/authorize?#{params.to_query}"
  end

  def exchange_slack_code(code)
    response = Faraday.post("https://slack.com/api/oauth.v2.access") do |req|
      req.headers["Content-Type"] = "application/x-www-form-urlencoded"
      req.body = {
        code: code,
        client_id: ENV.fetch("SLACK_CLIENT_ID", nil),
        client_secret: ENV.fetch("SLACK_CLIENT_SECRET", nil),
        redirect_uri: slack_callback_url
      }.to_query
    end

    data = JSON.parse(response.body)
    return nil unless data["ok"]

    data
  end
end
