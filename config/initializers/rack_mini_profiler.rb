if defined?(Rack::MiniProfiler)
  Rack::MiniProfiler.config.authorization_mode = :allow_authorized
  Rack::MiniProfiler.config.enable_advanced_debugging_tools = true

  Rack::MiniProfiler.prepend(Module.new do
    # Disable ?pp=env — it dumps full ENV (RAILS_MASTER_KEY, SENTRY_AUTH_TOKEN, DATABASE_URL passwords)
    # AND the Rack env hash (cookies, auth headers). No granular config exists; override the dispatcher.
    def dump_env(_env)
      text_result("?pp=env is disabled in this app for security. See config/initializers/rack_mini_profiler.rb.")
    end

    # Disable /mini-profiler-resources/snapshots — we don't run snapshot collection
    # (snapshot_every_n_requests defaults to -1), and the endpoint 500s in prod.
    def serve_snapshot(_env)
      [ 404, { "content-type" => "text/plain" }, [ "Snapshots disabled" ] ]
    end
  end)
end
