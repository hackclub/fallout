class Rack::Attack
  # Cache store for tracking requests
  Rack::Attack.cache.store = ActiveSupport::Cache::MemoryStore.new

  # Throttle all requests by IP (300 requests per 5 minutes)
  throttle("req/ip", limit: 300, period: 5.minutes) do |req|
    req.ip
  end

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
  self.throttled_responder = lambda do |env|
    retry_after = env["rack.attack.match_data"][:period]
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
  self.blocklisted_responder = lambda do |_env|
    [
      403,
      { "Content-Type" => "text/plain" },
      [ "Forbidden\n" ]
    ]
  end
end
