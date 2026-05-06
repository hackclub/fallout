# syntax=docker/dockerfile:1
# check=error=true;skip=SecretsUsedInArgOrEnv

# This Dockerfile is designed for production, not development. Use with Kamal or build'n'run by hand:
# docker build -t fallout .
# docker run -d -p 80:80 -e RAILS_MASTER_KEY=<value from config/master.key> --name fallout fallout

# For a containerized dev environment, see Dev Containers: https://guides.rubyonrails.org/getting_started_with_devcontainer.html

# Make sure RUBY_VERSION matches the Ruby version in .ruby-version
ARG RUBY_VERSION=3.4.4
FROM docker.io/library/ruby:$RUBY_VERSION-slim AS base

# Rails app lives here
WORKDIR /rails

# Install base packages — pinned to current Debian 12 (bookworm) stable versions to
# block unreviewed upgrades; update deliberately when Debian rolls a point release.
ARG CURL_VERSION=7.88.1-10+deb12u14
ARG LIBJEMALLOC2_VERSION=5.3.0-1
ARG LIBVIPS42_VERSION=8.14.1-3+deb12u2
# Enables PDF rendering through libvips (built with --enable-poppler upstream;
# the lib is dlopened at runtime so we install it explicitly). Used by
# ShipChecks::UnifiedScreenshotProcessor when the YSWS Unified upload's source
# file is a PDF (common for hackathon zines).
ARG LIBPOPPLER_GLIB8_VERSION=22.12.0-2+deb12u1
ARG SQLITE3_VERSION=3.40.1-2+deb12u2

RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y \
      curl="${CURL_VERSION}" \
      libjemalloc2="${LIBJEMALLOC2_VERSION}" \
      libvips42="${LIBVIPS42_VERSION}" \
      libpoppler-glib8="${LIBPOPPLER_GLIB8_VERSION}" \
      sqlite3="${SQLITE3_VERSION}" \
      wget && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

# Set production environment
ENV RAILS_ENV="production" \
    BUNDLE_DEPLOYMENT="1" \
    BUNDLE_PATH="/usr/local/bundle" \
    BUNDLE_WITHOUT="development"

# Throw-away build stage to reduce size of final image
FROM base AS build

# Install packages needed to build gems and node modules
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential curl git libyaml-dev pkg-config && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

# Install Node.js
ARG NODE_VERSION=22
RUN curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - && \
    apt-get install --no-install-recommends -y nodejs && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

# Install application gems
COPY Gemfile Gemfile.lock ./
RUN bundle install && \
    rm -rf ~/.bundle/ "${BUNDLE_PATH}"/ruby/*/cache "${BUNDLE_PATH}"/ruby/*/bundler/gems/*/.git && \
    bundle exec bootsnap precompile --gemfile

# Install node modules
COPY package.json package-lock.json ./
RUN npm ci

# Copy application code
COPY . .

# Precompile bootsnap code for faster boot times
RUN bundle exec bootsnap precompile app/ lib/

# Sentry release tag for source map upload + event tagging.
# Pass with: docker build --build-arg SENTRY_RELEASE=$(git rev-parse HEAD) ...
# Empty by default — vite plugin/sentry init silently fall back to no release.
ARG SENTRY_RELEASE=""
ENV SENTRY_RELEASE=${SENTRY_RELEASE}

# Precompiling assets for production without requiring secret RAILS_MASTER_KEY
RUN SECRET_KEY_BASE_DUMMY=1 ./bin/rails assets:precompile




# Final stage for app image
FROM base

# Re-declare and re-export so the Ruby Sentry SDK can read it at runtime
ARG SENTRY_RELEASE=""
ENV SENTRY_RELEASE=${SENTRY_RELEASE}

# Copy built artifacts: gems, application
COPY --from=build "${BUNDLE_PATH}" "${BUNDLE_PATH}"
COPY --from=build /rails /rails

# Run and own only the runtime files as a non-root user for security
RUN groupadd --system --gid 1000 rails && \
    useradd rails --uid 1000 --gid 1000 --create-home --shell /bin/bash && \
    chown -R rails:rails db log storage tmp
USER 1000:1000

ENTRYPOINT ["/rails/bin/docker-entrypoint"]
EXPOSE 80
CMD ["./bin/thrust", "./bin/rails", "server"]
