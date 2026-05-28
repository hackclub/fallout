# frozen_string_literal: true

require "net/http"
require "json"
require "base64"

module ShipChecks
  module ImageOriginality
    DEFINITION = { key: :image_originality, label: "Images are original (not found elsewhere online)", deps: [ :readme_content, :image_descriptions ], visibility: :internal }.freeze
    MAX_IMAGES = 25

    ApiError = Class.new(StandardError)

    def self.call(ctx)
      repo_nwo = ctx.repo_meta&.dig("full_name")
      readme = ctx.readme_content
      urls = raster_urls(ctx)
      return skip("No README images found") if urls.empty?

      api_key = ENV["GOOGLE_CLOUD_API_KEY"]
      return skip("Google Cloud Vision not configured") unless api_key

      tempfiles = ShipChecks::ReadmeImageDescriptions.download_images(urls)
      return skip("Could not download images") if tempfiles.empty?

      tempfiles.each_with_index do |tempfile, i|
        matches = web_detect(tempfile, api_key, repo_nwo, readme)
        next if matches.empty?

        # Early exit — first match is enough to flag
        sample = matches.first(3).join(", ")
        return ShipCheckService::CheckResult.new(
          key: "image_originality", label: DEFINITION[:label],
          status: :warn, message: "Image #{i + 1} found on #{matches.size} page(s): #{sample}", visibility: :internal
        )
      end

      ShipCheckService::CheckResult.new(
        key: "image_originality", label: DEFINITION[:label],
        status: :passed, message: nil, visibility: :internal
      )
    rescue ApiError => e
      skip(e.message)
    rescue StandardError
      skip("Google Vision analysis unavailable")
    ensure
      tempfiles&.each { |f| f.close! rescue nil } # rubocop:disable Style/RescueModifier
    end

    def self.raster_urls(ctx)
      (ctx.readme_image_urls || []).reject { |u| u.match?(/\.svg$/i) }.first(MAX_IMAGES)
    end

    def self.web_detect(tempfile, api_key, repo_nwo, readme)
      uri = URI("https://vision.googleapis.com/v1/images:annotate?key=#{api_key}")
      tempfile.rewind
      content = Base64.strict_encode64(tempfile.read)

      body = {
        requests: [ {
          image: { content: content },
          features: [ { type: "WEB_DETECTION", maxResults: 10 } ]
        } ]
      }.to_json

      request = Net::HTTP::Post.new(uri)
      request["Content-Type"] = "application/json"
      request.body = body

      response = Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 10, read_timeout: 10) do |http|
        http.request(request)
      end

      raise ApiError, "Google Vision API error (#{response.code})" unless response.is_a?(Net::HTTPSuccess)

      data = JSON.parse(response.body)
      annotation = data.dig("responses", 0, "webDetection") || {}

      pages = annotation["pagesWithMatchingImages"] || []
      full = annotation["fullMatchingImages"] || []

      match_urls = pages.filter_map { |p| p["url"] }
      match_urls += full.filter_map { |f| f["url"] }
      filter_known_urls(match_urls.uniq, repo_nwo, readme)
    end

    IGNORED_MATCH_HOSTS = %w[youtube.com youtu.be].freeze

    # Filter out the project's own repo and any URLs already referenced in the README.
    # YouTube is ignored because auto-extracted video thumbnails cause frequent false positives.
    def self.filter_known_urls(urls, repo_nwo, readme)
      readme_urls = readme&.scan(%r{https?://[^\s)\]>"]+})&.map { |u| URI(u).host rescue nil }&.compact&.uniq || [] # rubocop:disable Style/RescueModifier
      urls.reject do |u|
        host = URI(u).host rescue nil # rubocop:disable Style/RescueModifier
        (repo_nwo && u.include?(repo_nwo)) ||
          readme_urls.any? { |h| u.include?(h) } ||
          (host && IGNORED_MATCH_HOSTS.any? { |ignored| host == ignored || host.end_with?(".#{ignored}") })
      end
    end

    def self.skip(message)
      ShipCheckService::CheckResult.new(
        key: "image_originality", label: DEFINITION[:label],
        status: :skipped, message: message, visibility: :internal
      )
    end
  end
end
