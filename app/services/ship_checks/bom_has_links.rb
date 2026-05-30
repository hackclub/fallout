# frozen_string_literal: true

module ShipChecks
  module BomHasLinks
    DEFINITION = { key: :bom_has_links, label: "BOM links work", deps: [ :bom_content ], visibility: :user }.freeze

    def self.call(ctx)
      content = ctx.bom_content
      if content.nil?
        return ShipCheckService::CheckResult.new(
          key: "bom_has_links", label: DEFINITION[:label],
          status: :skipped, message: "No BOM file found", visibility: :user
        )
      end

      # Extract URLs respecting CSV quoting — quoted fields may contain commas that are part of the URL
      urls = content.scan(%r{"(https?://[^"]+)"|(?:^|,)(https?://[^\s,<>]+)})
                    .flatten.compact.map { |u| u.chomp(".") }.uniq
      if urls.empty?
        return ShipCheckService::CheckResult.new(
          key: "bom_has_links", label: DEFINITION[:label],
          status: :failed, message: "Add purchase links to your Bill of Materials so others can source parts",
          visibility: :user
        )
      end

      broken = urls.filter_map { |url| url unless resolves?(url) }
      if broken.any?
        ShipCheckService::CheckResult.new(
          key: "bom_has_links",
          label: DEFINITION[:label],
          status: :warn,
          message: "#{broken.size} of #{urls.size} BOM links are broken: #{broken.first(3).join(", ")}",
          visibility: :user
        )
      else
        ShipCheckService::CheckResult.new(
          key: "bom_has_links", label: DEFINITION[:label],
          status: :passed, message: nil, visibility: :user
        )
      end
    end

    def self.resolves?(url, retries: 2)
      uri = URI(url)
      response = Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https", open_timeout: 5, read_timeout: 5) do |http|
        # Try HEAD first, fall back to GET — some sites block HEAD requests
        res = http.head(uri.request_uri)
        res.is_a?(Net::HTTPSuccess) || res.is_a?(Net::HTTPRedirection) ? res : http.get(uri.request_uri)
      end
      return true if response.is_a?(Net::HTTPSuccess) || response.is_a?(Net::HTTPRedirection)
      # Cloudflare bot challenges return 403 with a "Just a moment..." interstitial
      # we can't solve — lean safe and treat the link as valid rather than failing the user.
      response.code.to_i == 403 && response.body.to_s.include?("Just a moment...")
    rescue StandardError
      retry if (retries -= 1) >= 0
      false
    end
  end
end
