source "https://rubygems.org"

# Bundle edge Rails instead: gem "rails", github: "rails/rails", branch: "main"
gem "rails", "~> 8.1"
# The modern asset pipeline for Rails [https://github.com/rails/propshaft]
gem "propshaft", "~> 1.3"
# Use sqlite3 as the database for Active Record
gem "sqlite3", ">= 2.1"
# Use the Puma web server [https://github.com/puma/puma]
gem "puma", ">= 5.0"
# Build JSON APIs with ease [https://github.com/rails/jbuilder]
gem "jbuilder", "~> 2.14"

# Use Active Model has_secure_password [https://guides.rubyonrails.org/active_model_basics.html#securepassword]
# gem "bcrypt", "~> 3.1.7"

# Windows does not include zoneinfo files, so bundle the tzinfo-data gem
gem "tzinfo-data", platforms: %i[ windows jruby ]

# Use the database-backed adapters for Rails.cache, Active Job, and Action Cable
gem "solid_cache", "~> 1.0"
gem "solid_queue", "~> 1.4"
gem "solid_cable", "~> 3.0"

# Reduces boot times through caching; required in config/boot.rb
gem "bootsnap", "~> 1.23", require: false

# Deploy this application anywhere as a Docker container [https://kamal-deploy.org]
gem "kamal", "~> 2.10", require: false

# Add HTTP asset caching/compression and X-Sendfile acceleration to Puma [https://github.com/basecamp/thruster/]
gem "thruster", "~> 0.1", require: false

# Use Active Storage variants [https://guides.rubyonrails.org/active_storage_overview.html#transforming-images]
gem "image_processing", "~> 1.2"


# Redis for cache and Action Cable
gem "redis", "~> 5.0"

# PostgreSQL adapter for ActiveRecord
gem "pg", "~> 1.5"

# Rack middleware for blocking & throttling
gem "rack-attack", "~> 6.7"

group :development, :test do
  # See https://guides.rubyonrails.org/debugging_rails_applications.html#debugging-with-the-debug-gem
  gem "debug", "~> 1.11", platforms: %i[ mri windows ], require: "debug/prelude"

  # Static analysis for security vulnerabilities [https://brakemanscanner.org/]
  gem "brakeman", "~> 8.0", require: false

  # Omakase Ruby styling [https://github.com/rails/rubocop-rails-omakase/]
  gem "rubocop-rails-omakase", "~> 1.1", require: false

  gem "dotenv-rails", "~> 3.2"
end

group :development do
  # Use console on exceptions pages [https://github.com/rails/web-console]
  gem "web-console", "~> 4.3"

  gem "annotaterb", "~> 4.22"
  gem "letter_opener", "~> 1.10"
  gem "bullet", "~> 8.1"
end

group :test do
  # Use system testing [https://guides.rubyonrails.org/testing.html#system-testing]
  gem "capybara", "~> 3.40"
  gem "selenium-webdriver", "~> 4.41"
end


gem "faraday", "~> 2.13"
gem "rubyzip", "~> 3.0"

gem "slack-ruby-client", "~> 3.0"

gem "ahoy_matey", "~> 5.5"
gem "geocoder", "~> 1.8"

gem "pundit", "~> 2.4"
gem "paper_trail", "~> 17.0"
gem "mission_control-jobs", "~> 1.1"

gem "sentry-ruby", "~> 6.5"
gem "sentry-rails", "~> 6.5"

# Performance profiling — admin-gated in prod, open in dev
gem "rack-mini-profiler", "~> 4.0"
gem "stackprof", "~> 0.2"
gem "rails_performance", "~> 1.6"
gem "query_count", "~> 1.1"

gem "redcarpet", "~> 3.6"

gem "aws-sdk-s3", "~> 1.219", require: false

gem "pagy", "~> 43.5"
gem "pg_search", "~> 2.3"
gem "meilisearch-rails", "~> 0.13"

gem "inertia_rails", "~> 3.20"

gem "vite_rails", "~> 3.10"

gem "inertia_rails-contrib", "~> 0.5.2"

gem "countries", "~> 8.1"

gem "flipper", "~> 1.4"
gem "flipper-active_record", "~> 1.3"
gem "flipper-ui", "~> 1.4"

gem "ruby_llm", "~> 1.14"

gem "scoped_search", "~> 4.3"
