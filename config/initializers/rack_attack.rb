class Rack::Attack
  # Cache store for tracking requests
  Rack::Attack.cache.store = Rails.cache

  # Throttle GET /auth/hca/start (signin) by IP (10 per minute)
  throttle("auth/hca/start/ip", limit: 10, period: 1.minute) do |req|
    req.ip if req.path == "/auth/hca/start" && req.get?
  end

  # Throttle GET /auth/hca/callback (OAuth callback) by IP (20 per minute)
  throttle("auth/hca/callback/ip", limit: 20, period: 1.minute) do |req|
    req.ip if req.path == "/auth/hca/callback" && req.get?
  end

  # Throttle DELETE /auth/signout (signout) by IP (10 per minute)
  throttle("auth/signout/ip", limit: 10, period: 1.minute) do |req|
    req.ip if req.path == "/auth/signout" && req.delete?
  end

  # RSVP — unauthenticated, makes external Airtable API call
  throttle("rsvp/ip", limit: 5, period: 1.minute) do |req|
    req.ip if req.path == "/rsvp" && req.post?
  end

  # YouTube video lookup — makes external API call
  throttle("youtube_lookup/ip", limit: 10, period: 1.minute) do |req|
    req.ip if req.path == "/you_tube_videos/lookup" && req.post?
  end

  # Trial session creation — back-pressure against signup spam. IP-keyed primary,
  # email-keyed secondary so one attacker can't burn through many IPs per email.
  throttle("trial_session/ip", limit: 10, period: 3.minutes) do |req|
    req.ip if req.path == "/trial_session" && req.post?
  end

  throttle("trial_session/email", limit: 5, period: 1.hour) do |req|
    if req.path == "/trial_session" && req.post?
      email = req.POST["email"].to_s.strip.downcase.presence
      Digest::SHA256.hexdigest(email) if email # hash so plaintext emails don't end up in cache
    end
  end

  # /api/v1/* — protected by EXTERNAL_API_KEY already (Api::V1::BaseController).
  # Rate limit by hashed key (fair per-consumer) with an IP backstop.
  throttle("api/v1/key", limit: 120, period: 1.minute) do |req|
    if req.path.start_with?("/api/v1/")
      key = req.get_header("HTTP_AUTHORIZATION")&.delete_prefix("Bearer ")
      Digest::SHA256.hexdigest(key) if key.present?
    end
  end

  throttle("api/v1/ip", limit: 60, period: 1.minute) do |req|
    req.ip if req.path.start_with?("/api/v1/")
  end

  # Collaboration invite creation — gated by feature flag + policy, but still throttled
  # to bound email enumeration + spam. User-scoped (falls back to IP).
  throttle("collab_invites/user", limit: 20, period: 1.hour) do |req|
    if req.path.match?(%r{\A/projects/\d+/collaboration_invites\z}) && req.post?
      req.env["warden"]&.user&.id&.to_s || req.ip
    end
  end

  # Block suspicious requests
  blocklist("block suspicious requests") do |req|
    # Block requests with suspicious user agents
    Rack::Attack::Fail2Ban.filter("pentesters-#{req.ip}", maxretry: 5, findtime: 10.minutes, bantime: 1.hour) do
      CGI.unescape(req.query_string) =~ %r{/etc/passwd} ||
      req.path.include?("/etc/passwd") ||
      req.path.include?("wp-admin") ||
      req.path.include?("wp-login")
    end
  end

  # Custom throttle response
  self.throttled_responder = lambda do |request|
    retry_after = request.env["rack.attack.match_data"][:period]
    [
      429,
      {
        "Content-Type" => "text/plain",
        "Retry-After" => retry_after.to_s
      },
      [ "Too many requests. Please try again later.\n" ]
    ]
  end

  # Custom blocklist response
  self.blocklisted_responder = lambda do |_request|
    [
      403,
      { "Content-Type" => "text/plain" },
      [ "Forbidden\n" ]
    ]
  end
end
