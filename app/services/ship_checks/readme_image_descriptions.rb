# frozen_string_literal: true

require "tempfile"

module ShipChecks
  module ReadmeImageDescriptions
    MAX_IMAGES = 25

    # Called by SharedContext#fetch_image_descriptions — single LLM call with all images.
    # Downloads images as temp files and sends as base64 to avoid signed-URL and content-filter issues.
    def self.describe_all(ctx)
      content = ctx.readme_content
      return nil if content.nil?

      urls = extract_image_urls(content, ctx).reject { |u| badge_or_svg?(u) }
      return nil if urls.empty?

      tempfiles = download_images(urls.first(MAX_IMAGES))
      return nil if tempfiles.empty?

      project_desc = ctx.project.description.presence || "a hardware/electronics project"

      chat = RubyLLM.chat
      response = chat.ask(
        <<~PROMPT,
          You are reviewing images for a hardware/electronics grant project: #{project_desc}

          You are being shown #{tempfiles.size} images from the project's README. For each image, write a one-sentence description focusing on hardware relevance (PCB, 3D model, wiring diagram, assembled device, schematic, enclosure, etc.). If an image is not hardware-related, say so.

          Format your response as a numbered list, one line per image. No other text.
        PROMPT
        with: tempfiles.map(&:path)
      )

      response.content.strip.lines.filter_map do |line|
        line.sub(/\A\d+[\.\)]\s*/, "").strip.presence
      end
    rescue StandardError
      nil
    ensure
      tempfiles&.each { |f| f.close! rescue nil } # rubocop:disable Style/RescueModifier
    end

    def self.extract_image_urls(content, ctx)
      nwo = ctx.repo_meta&.dig("full_name")
      branch = ctx.repo_meta&.dig("default_branch") || "main"

      markdown_urls = content.scan(/!\[.*?\]\((.*?)\)/).flatten
      html_urls = content.scan(/<img[^>]+src=["']([^"']+)["']/i).flatten

      (markdown_urls + html_urls).filter_map do |url|
        resolve_image_url(url.strip, nwo, branch)
      end.uniq
    end

    def self.resolve_image_url(url, nwo, branch)
      if url.match?(%r{\Ahttps?://}i)
        url
      elsif nwo
        "https://raw.githubusercontent.com/#{nwo}/#{branch}/#{url.sub(%r{\A\./}, "")}"
      end
    end

    def self.download_images(urls)
      urls.filter_map do |url|
        response = safe_get(url)
        next unless response.is_a?(Net::HTTPSuccess)

        ext = detect_extension(response)
        tempfile = Tempfile.new([ "preflight", ext ])
        tempfile.binmode
        tempfile.write(response.body)
        tempfile.rewind
        tempfile
      rescue StandardError
        nil
      end
    end

    # SSRF-safe GET. URLs come from user-controlled README markdown — every
    # outbound fetch must go through SafeHttp to reject private IPs and pin
    # the connection against DNS rebinding. Redirects (GitHub user-
    # attachment → S3) are re-validated on the second hop.
    def self.safe_get(url, follow_redirect: true)
      uri = URI.parse(url)
      return nil unless uri.is_a?(URI::HTTP)

      safe_ip = ShipChecks::SafeHttp.resolve_safe_ip(uri.host)
      return nil unless safe_ip

      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = (uri.scheme == "https")
      http.ipaddr = safe_ip
      response = http.start { |conn| conn.get(uri.request_uri) }

      if follow_redirect && response.is_a?(Net::HTTPRedirection)
        location = response["location"].to_s
        return nil if location.empty?
        safe_get(URI.join(uri.to_s, location).to_s, follow_redirect: false)
      else
        response
      end
    rescue StandardError
      nil
    end

    def self.badge_or_svg?(url)
      url.match?(/\.svg(\?|$)/i) || url.include?("img.shields.io") || url.include?("badge")
    end

    def self.detect_extension(response)
      ct = response["content-type"].to_s
      case ct
      when /png/ then ".png"
      when /jpeg|jpg/ then ".jpg"
      when /gif/ then ".gif"
      when /webp/ then ".webp"
      when /svg/ then ".svg"
      else ".png"
      end
    end
  end
end
