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
ARG SQLITE3_VERSION=3.40.1-2+deb12u2

RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y \
      curl="${CURL_VERSION}" \
      libjemalloc2="${LIBJEMALLOC2_VERSION}" \
      libvips42="${LIBVIPS42_VERSION}" \
      sqlite3="${SQLITE3_VERSION}" && \
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

# Download s6-overlay (process supervisor for running Meilisearch alongside Rails)
# TARGETARCH is set automatically by Docker buildx (amd64 or arm64).
ARG S6_VERSION=3.2.2.0
RUN ARCH=$([ "$(uname -m)" = "aarch64" ] && echo "aarch64" || echo "x86_64") && \
    curl -fsSL "https://github.com/just-containers/s6-overlay/releases/download/v${S6_VERSION}/s6-overlay-noarch.tar.xz" \
      -o /tmp/s6-noarch.tar.xz && \
    curl -fsSL "https://github.com/just-containers/s6-overlay/releases/download/v${S6_VERSION}/s6-overlay-${ARCH}.tar.xz" \
      -o /tmp/s6-arch.tar.xz

# Download Meilisearch binary
ARG MEILISEARCH_VERSION=1.42.1
RUN ARCH=$([ "$(uname -m)" = "aarch64" ] && echo "aarch64" || echo "amd64") && \
    curl -fsSL "https://github.com/meilisearch/meilisearch/releases/download/v${MEILISEARCH_VERSION}/meilisearch-linux-${ARCH}" \
      -o /usr/local/bin/meilisearch && \
    chmod +x /usr/local/bin/meilisearch

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

# Install s6-overlay into the final image (xz-utils required for -J flag on slim base)
COPY --from=build /tmp/s6-noarch.tar.xz /tmp/s6-noarch.tar.xz
COPY --from=build /tmp/s6-arch.tar.xz /tmp/s6-arch.tar.xz
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y xz-utils && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives && \
    tar -C / -Jxpf /tmp/s6-noarch.tar.xz && \
    tar -C / -Jxpf /tmp/s6-arch.tar.xz && \
    rm /tmp/s6-noarch.tar.xz /tmp/s6-arch.tar.xz

# Copy Meilisearch binary
COPY --from=build /usr/local/bin/meilisearch /usr/local/bin/meilisearch

# Copy built artifacts: gems, application
COPY --from=build "${BUNDLE_PATH}" "${BUNDLE_PATH}"
COPY --from=build /rails /rails

# s6 service: Meilisearch
RUN mkdir -p /etc/s6-overlay/s6-rc.d/meilisearch && \
    printf '#!/bin/sh\nexec /usr/local/bin/meilisearch --db-path /rails/storage/meilisearch --http-addr 127.0.0.1:7700 --no-analytics\n' \
      > /etc/s6-overlay/s6-rc.d/meilisearch/run && \
    chmod +x /etc/s6-overlay/s6-rc.d/meilisearch/run && \
    echo "longrun" > /etc/s6-overlay/s6-rc.d/meilisearch/type && \
    touch /etc/s6-overlay/s6-rc.d/user/contents.d/meilisearch

# s6 service: Rails (wraps the original entrypoint logic + server start)
RUN mkdir -p /etc/s6-overlay/s6-rc.d/rails && \
    printf '#!/bin/sh\ncd /rails\nexec /rails/bin/docker-entrypoint ./bin/thrust ./bin/rails server\n' \
      > /etc/s6-overlay/s6-rc.d/rails/run && \
    chmod +x /etc/s6-overlay/s6-rc.d/rails/run && \
    echo "longrun" > /etc/s6-overlay/s6-rc.d/rails/type && \
    mkdir -p /etc/s6-overlay/s6-rc.d/rails/dependencies.d && \
    touch /etc/s6-overlay/s6-rc.d/rails/dependencies.d/meilisearch && \
    touch /etc/s6-overlay/s6-rc.d/user/contents.d/rails

# Run and own only the runtime files as a non-root user for security
RUN groupadd --system --gid 1000 rails && \
    useradd rails --uid 1000 --gid 1000 --create-home --shell /bin/bash && \
    chown -R rails:rails db log storage tmp
USER 1000:1000

# s6-overlay takes over as PID 1 and supervises both Meilisearch and Rails
ENTRYPOINT ["/init"]
EXPOSE 80
