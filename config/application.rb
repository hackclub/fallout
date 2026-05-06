require_relative "boot"

require "rails/all"

# Require the gems listed in Gemfile, including any gems
# you've limited to :test, :development, or :production.
Bundler.require(*Rails.groups)

module Fallout
  class Application < Rails::Application
    # Initialize configuration defaults for originally generated Rails version.
    config.load_defaults 8.0

    # Please, add to the `ignore` list any other `lib` subdirectories that do
    # not contain `.rb` files, or that should not be reloaded or eager loaded.
    # Common ones are `templates`, `generators`, or `middleware`, for example.
    config.autoload_lib(ignore: %w[assets tasks])

    # Enable Rack::Attack middleware
    config.middleware.use Rack::Attack

    # Serve Active Storage under /user-attachments instead of /rails/active_storage
    config.active_storage.routes_prefix = "/user-attachments"

    # Allow reading existing plaintext values while transitioning to encrypted device_token
    config.active_record.encryption.support_unencrypted_data = true

    # Mission Control Jobs — disable built-in HTTP Basic Auth; access gated by AdminConstraint in routes
    MissionControl::Jobs.base_controller_class = "Admin::EngineController"
    config.mission_control.jobs.http_basic_auth_enabled = false

    # Load Flipper feature flag descriptions for the Flipper UI dashboard
    config.flipper_features = config_for(:flipper_features)

    # Per-request cache hit/miss counters for the admin perf badge (read in expose_query_count)
    ActiveSupport::Notifications.subscribe("cache_read.active_support") do |*args|
      event = ActiveSupport::Notifications::Event.new(*args)
      if event.payload[:hit]
        Thread.current[:cache_hits] = (Thread.current[:cache_hits] || 0) + 1
      else
        Thread.current[:cache_misses] = (Thread.current[:cache_misses] || 0) + 1
      end
    rescue StandardError
      Rails.logger.warn("perf badge: failed to record cache event")
    end
    ActiveSupport::Notifications.subscribe("cache_fetch_hit.active_support") do |*_args|
      Thread.current[:cache_hits] = (Thread.current[:cache_hits] || 0) + 1
    end

    # Configuration for the application, engines, and railties goes here.
    #
    # These settings can be overridden in specific environments using the files
    # in config/environments, which are processed later.
    #
    # config.time_zone = "Central Time (US & Canada)"
    # config.eager_load_paths << Rails.root.join("extras")
  end
end
