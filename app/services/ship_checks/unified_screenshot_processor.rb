# frozen_string_literal: true

require "tempfile"
# Addressable is a transitive dep of several gems but isn't autoloaded; require
# it explicitly so Addressable::URI is defined when the worker boots.
require "addressable/uri"

module ShipChecks
  # Downloads a source file, transcodes to JPEG via libvips, and shrinks
  # quality progressively until it fits the 5MB Airtable attachment cap.
  # Returns JPEG bytes on success, nil on any failure.
  #
  # Supports raster images handled natively by libvips (PNG/JPG/WEBP/GIF)
  # plus PDF (first page rendered via libpoppler — the production Docker
  # image installs libpoppler-glib8 explicitly so vips's PDF loader works).
  # SVG is skipped — that would need librsvg.
  module UnifiedScreenshotProcessor
    MAX_BYTES = 5 * 1024 * 1024
    # PDFs can be arbitrarily large; cap the input size we'll bother to render.
    # 50MB is generous for typical hackathon zines (well under 5MB) but cheaply
    # rejects pathological multi-hundred-page submissions before vips hits them.
    MAX_PDF_INPUT_BYTES = 50 * 1024 * 1024
    # Hard cap on bytes we'll pull from a remote source — covers PDFs and raster
    # images. download_with_etag bails before reading the body if Content-Length
    # exceeds this, so a malicious or accidental giant file doesn't blow memory.
    MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024
    # Lower than Net::HTTP defaults; matches ShipCheckService::GITHUB_TIMEOUT so a
    # stuck origin doesn't pin a Solid Queue worker.
    DOWNLOAD_OPEN_TIMEOUT = 8
    DOWNLOAD_READ_TIMEOUT = 15
    JPEG_INITIAL_QUALITY = 85
    JPEG_MIN_QUALITY = 30
    MAX_DIMENSION = 2400
    PDF_RENDER_DPI = 150

    EXT_FOR_CONTENT_TYPE = {
      "image/png" => ".png",
      "image/jpeg" => ".jpg",
      "image/webp" => ".webp",
      "image/gif" => ".gif",
      "application/pdf" => ".pdf"
    }.freeze

    SUPPORTED_CONTENT_TYPES = EXT_FOR_CONTENT_TYPE.keys.freeze

    # GitHub raw and many CDNs return application/octet-stream for files (PDFs
    # in particular). When the response content-type isn't one we know how to
    # handle, fall back to the URL's path extension to identify the format.
    CONTENT_TYPE_FROM_EXT = {
      ".png" => "image/png",
      ".jpg" => "image/jpeg",
      ".jpeg" => "image/jpeg",
      ".webp" => "image/webp",
      ".gif" => "image/gif",
      ".pdf" => "application/pdf"
    }.freeze

    def self.process(url)
      bytes, content_type = download(url)
      return nil unless bytes && content_type

      effective_type = resolve_content_type(content_type, url)
      unless SUPPORTED_CONTENT_TYPES.include?(effective_type)
        Rails.logger.warn("UnifiedScreenshotProcessor: unsupported content_type=#{content_type} for url=#{url}")
        return nil
      end

      if effective_type == "application/pdf" && bytes.bytesize > MAX_PDF_INPUT_BYTES
        Rails.logger.warn("UnifiedScreenshotProcessor: PDF source #{bytes.bytesize} bytes exceeds #{MAX_PDF_INPUT_BYTES} cap for url=#{url}")
        return nil
      end

      transcode_to_jpeg(bytes, effective_type)
    rescue StandardError => e
      Rails.logger.error("UnifiedScreenshotProcessor failed for #{url}: #{e.class}: #{e.message}")
      nil
    end

    def self.resolve_content_type(server_ct, url)
      return server_ct if SUPPORTED_CONTENT_TYPES.include?(server_ct)
      uri = normalize_uri(url)
      return nil unless uri
      CONTENT_TYPE_FROM_EXT[File.extname(uri.path).downcase]
    end

    def self.transcode_to_jpeg(input_bytes, content_type)
      src_ext = EXT_FOR_CONTENT_TYPE.fetch(content_type)

      Tempfile.create([ "screenshot_src", src_ext ]) do |src|
        src.binmode
        src.write(input_bytes)
        src.flush

        Tempfile.create([ "screenshot_dst", ".jpg" ]) do |dst|
          quality = JPEG_INITIAL_QUALITY
          loop do
            pipeline = ImageProcessing::Vips.source(src.path)
            # vips's PDF loader options: page=0 starts at the first page and
            # n=1 caps to a single page (vips's default is also 1, but we set
            # it explicitly so multi-page PDFs never accidentally render
            # everything). dpi controls raster resolution. Image loaders don't
            # accept these args, so we apply them only for PDFs.
            pipeline = pipeline.loader(page: 0, n: 1, dpi: PDF_RENDER_DPI) if content_type == "application/pdf"
            pipeline
              .resize_to_limit(MAX_DIMENSION, MAX_DIMENSION)
              .convert("jpg")
              .saver(quality: quality, strip: true)
              .call(destination: dst.path)

            size = File.size(dst.path)
            break if size <= MAX_BYTES
            break if quality <= JPEG_MIN_QUALITY
            quality -= 10
          end

          if File.size(dst.path) > MAX_BYTES
            Rails.logger.warn("UnifiedScreenshotProcessor: cannot fit under #{MAX_BYTES} bytes even at quality=#{JPEG_MIN_QUALITY}")
            return nil
          end

          File.binread(dst.path)
        end
      end
    end

    def self.download(url)
      uri = normalize_uri(url)
      return [ nil, nil ] unless uri

      response = Net::HTTP.get_response(uri)
      if response.is_a?(Net::HTTPRedirection)
        redirect = normalize_uri(response["location"])
        return [ nil, nil ] unless redirect
        response = Net::HTTP.get_response(redirect)
      end
      return [ nil, nil ] unless response.is_a?(Net::HTTPSuccess)
      [ response.body, response["content-type"].to_s.split(";").first&.strip ]
    rescue StandardError
      [ nil, nil ]
    end

    # Conditional GET wrapper used by ComputeProjectUnifiedThumbnailJob to keep
    # cached zines fresh without re-downloading on every refresh. Returns a tagged
    # hash so callers can distinguish definitive states (304 unchanged, 404 gone)
    # from transient failures — purges must only happen on positive proof of
    # deletion (:gone), never on :error, so transient outages don't false-purge.
    #
    # Returns:
    #   { status: :unchanged }                                — 304
    #   { status: :changed, bytes:, content_type:, etag: }    — 2xx with body
    #   { status: :gone }                                     — 404 or 410
    #   { status: :too_large, size: }                         — body exceeds MAX_DOWNLOAD_BYTES
    #   { status: :error, detail: }                           — anything else (5xx, timeout, DNS, etc.)
    def self.download_with_etag(url, if_none_match: nil)
      uri = normalize_uri(url)
      return { status: :error, detail: "invalid url" } unless uri
      return { status: :error, detail: "unsupported scheme #{uri.scheme}" } unless uri.is_a?(URI::HTTP)

      perform_conditional_get(uri, if_none_match, follow_redirect: true)
    rescue Net::OpenTimeout, Net::ReadTimeout, Errno::ECONNREFUSED, Errno::ECONNRESET, SocketError => e
      { status: :error, detail: "#{e.class}: #{e.message}" }
    rescue StandardError => e
      Rails.logger.warn("UnifiedScreenshotProcessor.download_with_etag failed for #{url}: #{e.class}: #{e.message}")
      { status: :error, detail: "#{e.class}: #{e.message}" }
    end

    # Source URLs come from raw GitHub paths or markdown image refs that may
    # include spaces or non-ASCII characters (e.g. "ZINE page.png"). Ruby's
    # URI() raises on those; Addressable normalizes them into valid percent-
    # encoded form first.
    def self.normalize_uri(raw_url)
      return nil if raw_url.blank?
      URI(Addressable::URI.parse(raw_url).normalize.to_s)
    rescue StandardError
      nil
    end

    def self.perform_conditional_get(uri, if_none_match, follow_redirect:)
      # SSRF guard: resolve the host once and pin Net::HTTP to that IP so
      # DNS rebinding can't swap in a private address between validation
      # and connection. Caller URLs come from user-controlled README
      # markdown — never trust the hostname blindly.
      safe_ip = ShipChecks::SafeHttp.resolve_safe_ip(uri.host)
      return { status: :error, detail: "host blocked: #{uri.host}" } unless safe_ip

      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = (uri.scheme == "https")
      http.ipaddr = safe_ip
      http.open_timeout = DOWNLOAD_OPEN_TIMEOUT
      http.read_timeout = DOWNLOAD_READ_TIMEOUT

      http.start do |conn|
        request = Net::HTTP::Get.new(uri.request_uri)
        request["If-None-Match"] = if_none_match if if_none_match.present?
        request["User-Agent"] = "fallout-unified-thumbnail"

        response = conn.request(request)
        code = response.code.to_i

        case code
        when 304
          { status: :unchanged }
        when 200..299
          declared_size = response["content-length"].to_i
          return { status: :too_large, size: declared_size } if declared_size > MAX_DOWNLOAD_BYTES
          body = response.body.to_s
          return { status: :too_large, size: body.bytesize } if body.bytesize > MAX_DOWNLOAD_BYTES

          {
            status: :changed,
            bytes: body,
            content_type: response["content-type"].to_s.split(";").first&.strip,
            etag: response["etag"]
          }
        when 301, 302, 303, 307, 308
          return { status: :error, detail: "redirect loop" } unless follow_redirect

          target = response["location"].to_s
          return { status: :error, detail: "redirect without Location" } if target.blank?

          target_uri = normalize_uri(URI.join(uri.to_s, target).to_s)
          return { status: :error, detail: "invalid redirect target" } unless target_uri&.is_a?(URI::HTTP)

          perform_conditional_get(target_uri, if_none_match, follow_redirect: false)
        when 404, 410
          { status: :gone }
        else
          { status: :error, detail: "HTTP #{code}" }
        end
      end
    end
    private_class_method :perform_conditional_get
  end
end
