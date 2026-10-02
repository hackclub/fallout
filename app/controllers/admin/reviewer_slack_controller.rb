# Links a Phase 2 reviewer's Slack account through the dedicated reviewer Slack app (separate from
# the profile-photo app behind SlackAuthController) so DR/BR feedback posts to #fallout-checkpoint
# as the reviewer, and serves the @mention autocomplete for the feedback composer.
class Admin::ReviewerSlackController < Admin::ApplicationController
  include OauthState

  USER_SCOPE = "chat:write"
  MENTION_RESULT_LIMIT = 8

  skip_after_action :verify_authorized # No index action — blanket skip required (Rails 8.1 callback validation); every action authorizes explicitly
  skip_after_action :verify_policy_scoped # No index action — blanket skip required (Rails 8.1 callback validation)
  rate_limit to: 10, within: 3.minutes, only: :callback, with: -> { redirect_to admin_root_path, alert: "Try again later." }

  def connect
    authorize :reviewer_slack, :connect?
    state = SecureRandom.hex(24)
    set_oauth_cookie(:reviewer_slack_oauth, { "state" => state, "return_to" => safe_return_to(params[:return_to]) })
    redirect_to authorize_url(state), allow_other_host: true
  end

  def callback
    authorize :reviewer_slack, :connect?
    stored = Hash(cookies.encrypted[:reviewer_slack_oauth])
    delete_oauth_cookie(:reviewer_slack_oauth)
    return_to = safe_return_to(stored["return_to"])

    # CSRF guard: the state must round-trip through our encrypted cookie.
    unless stored["state"].present? && ActiveSupport::SecurityUtils.secure_compare(stored["state"], params[:state].to_s)
      return redirect_to return_to, alert: "Slack authorization failed. Try linking again."
    end
    return redirect_to return_to, alert: "Slack linking was cancelled." if params[:error].present?

    data = exchange_code(params[:code])
    token = data&.dig("authed_user", "access_token")
    return redirect_to return_to, alert: "Couldn't link Slack. Try again." if token.blank?

    # Only accept the Slack account tied to this user's HCA identity, so every checkpoint
    # message is attributable to the reviewer who actually submitted the review.
    if data.dig("authed_user", "id") != current_user.normalized_slack_id
      revoke(token)
      return redirect_to return_to, alert: "That Slack account isn't the one linked to your Fallout account."
    end

    current_user.update!(reviewer_slack_token: token)
    redirect_to return_to, notice: "Slack linked — feedback will post to #fallout-checkpoint as you."
  rescue Faraday::Error, JSON::ParserError => e
    ErrorReporter.capture_exception(e)
    redirect_to return_to || admin_root_path, alert: "Couldn't link Slack. Try again."
  end

  def disconnect
    authorize :reviewer_slack, :connect?
    revoke(current_user.reviewer_slack_token)
    current_user.update!(reviewer_slack_token: nil)
    redirect_back fallback_location: admin_root_path, notice: "Slack unlinked."
  end

  def mentions
    authorize :reviewer_slack, :mentions?
    query = params[:q].to_s.strip.first(50)
    return render(json: { users: [] }) if query.blank?

    # Display-name match only (never email) — mention search is open to non-admin reviewers.
    users = User.verified.kept.where.not(slack_id: nil)
      .where("display_name ILIKE ?", "%#{User.sanitize_sql_like(query)}%")
      .order(Arel.sql("LENGTH(display_name)"), :display_name)
      .limit(MENTION_RESULT_LIMIT)

    render json: { users: users.map { |u| { id: u.id, display_name: u.display_name, avatar: u.avatar } } }
  end

  private

  # Only same-app admin paths, so the OAuth round-trip can't be used as an open redirect.
  def safe_return_to(path)
    path = path.to_s
    path.start_with?("/admin/") && !path.include?("\\") ? path : admin_root_path
  end

  def authorize_url(state)
    query = {
      client_id: ENV.fetch("REVIEWER_SLACK_CLIENT_ID", nil),
      user_scope: USER_SCOPE,
      redirect_uri: admin_reviewer_slack_callback_url,
      state: state
    }
    "https://slack.com/oauth/v2/authorize?#{query.to_query}"
  end

  def exchange_code(code)
    response = Faraday.post("https://slack.com/api/oauth.v2.access") do |req|
      req.headers["Content-Type"] = "application/x-www-form-urlencoded"
      req.body = {
        code: code,
        client_id: ENV.fetch("REVIEWER_SLACK_CLIENT_ID", nil),
        client_secret: ENV.fetch("REVIEWER_SLACK_CLIENT_SECRET", nil),
        redirect_uri: admin_reviewer_slack_callback_url
      }.to_query
    end

    data = JSON.parse(response.body)
    data["ok"] ? data : nil
  end

  def revoke(token)
    return if token.blank?

    Slack::Web::Client.new(token: token).auth_revoke
  rescue Slack::Web::Api::Errors::SlackError, Faraday::Error
    nil # Best-effort — the token is dropped locally either way
  end
end
