require "aws-sdk-s3"
require "net/http"
require "digest"
require "tempfile"
require "json"
require "open3"
require "marcel"

class LapseArchiveService
  class Error < StandardError; end
  class FootageGone < Error; end # the video URL 404/410s — footage no longer on Lapse

  PREFIX = "lapse-archive".freeze
  SCHEMA_VERSION = 1
  MAX_REDIRECTS = 3
  UPLOAD_RETRIES = 4
  FFPROBE_TIMEOUT = 30 # seconds — hard cap so a malformed file can't hang a worker

  # Per-call phase timings in seconds (fetch/download/probe/upload) — surfaced by the backfill
  # task so a slow run shows exactly which phase (Lapse download vs R2 upload) is the bottleneck.
  attr_reader :last_timings

  # Human-readable phase breakdown with throughput, e.g.
  # "fetch=0.3s download=2.1s@45.6Mbps probe=0.4s upload=57.1s@1.7Mbps".
  def timing_summary
    (@last_timings || {}).map do |phase, secs|
      bytes = (@last_bytes || {})[phase].to_i
      if bytes.positive? && secs.positive?
        "#{phase}=#{secs}s@#{(bytes * 8.0 / secs / 1_000_000).round(1)}Mbps"
      else
        "#{phase}=#{secs}s"
      end
    end.join(" ")
  end

  # Returns :archived (footage captured); :archived_metadata_only (no footage on Lapse —
  # metadata.json + thumbnail if present still captured); :skipped (already archived and
  # not forced). Lapse is semi-unstable, so we validate the API data and probe any
  # downloaded footage BEFORE uploading or stamping archived_at — any real failure (corrupt
  # API data, failed download, unreadable video, R2 error) raises, is reported to Sentry,
  # and leaves the row un-archived so a later backfill retries it (fail-closed).
  def archive!(lapse_timelapse, force: false)
    return :skipped if lapse_timelapse.archived_at.present? && !force

    @last_timings = {}
    # Full raw fetch_timelapse JSON. The model handles user-token → program-key fallback,
    # so this works when backfilling across every user. nil = Lapse down / timelapse gone
    # (malformed JSON also surfaces as nil from LapseService).
    raw = timed(:fetch) { lapse_timelapse.fetch_data }

    # If Lapse returned a body it must be a JSON object; anything else is a corrupt/garbled
    # response we refuse to treat as a valid snapshot. (A valid object that simply lacks a
    # playbackUrl is a footage-less timelapse — archived metadata-only below, not an error.)
    if raw.present? && !raw.is_a?(Hash)
      raise Error, "Corrupt Lapse API data for ##{lapse_timelapse.id} (expected object, got #{raw.class})"
    end

    # Prefer the freshest URLs from the live response; fall back to our cached columns.
    playback_url  = raw&.dig("playbackUrl").presence || lapse_timelapse.playback_url.presence
    thumbnail_url = raw&.dig("thumbnailUrl").presence || lapse_timelapse.thumbnail_url.presence

    id     = lapse_timelapse.lapse_timelapse_id
    prefix = "#{PREFIX}/#{id}"

    # Capture whatever exists. A footage-less timelapse (FAILED_PROCESSING / unpublished) or
    # one whose video has 404'd off Lapse still gets a metadata-only archive (record + any thumbnail).
    video = playback_url ? timed(:download) { download_asset(playback_url, video_ext(raw, playback_url)) } : nil
    video[:probe_duration] = timed(:probe) { verify_video!(video) } if video

    thumb = thumbnail_url ? download_asset(thumbnail_url, thumb_ext(thumbnail_url)) : nil
    verify_thumbnail!(thumb) if thumb

    @last_bytes = {
      download: video&.fetch(:byte_size, 0).to_i,
      upload: video&.fetch(:byte_size, 0).to_i + thumb&.fetch(:byte_size, 0).to_i
    }

    video_key = video && "#{prefix}/video#{video[:ext]}"
    thumb_key = thumb && "#{prefix}/thumbnail#{thumb[:ext]}"

    timed(:upload) do
      upload_file(video_key, video) if video
      upload_file(thumb_key, thumb) if thumb
    end

    metadata = {
      schema_version: SCHEMA_VERSION,
      archived_at: Time.current.utc.iso8601,
      lapse_timelapse_id: id,
      video_archived: !video.nil?, # false = metadata-only (no footage existed on Lapse)
      source: raw, # full raw API response — future-proof
      db_record: lapse_timelapse.attributes, # cached row incl. inactive_segments, owner_*, duration
      assets: {
        video: asset_manifest(playback_url, video_key, video),
        thumbnail: asset_manifest(thumbnail_url, thumb_key, thumb)
      }
    }
    upload_json("#{prefix}/metadata.json", metadata)

    lapse_timelapse.update!(
      archived_at: Time.current,
      archive_video_byte_size: video&.fetch(:byte_size, nil),
      archive_checksum: video&.fetch(:sha256, nil) # nil checksum = metadata-only archive (queryable)
    )
    video ? :archived : :archived_metadata_only
  rescue StandardError => e
    ErrorReporter.capture_exception(e, contexts: {
      lapse_archive: { lapse_timelapse_id: lapse_timelapse.lapse_timelapse_id }
    })
    raise
  ensure
    video[:tempfile].close! if video && !video[:tempfile].closed?
    thumb[:tempfile].close! if thumb && !thumb[:tempfile].closed?
  end

  # Read-only check that an archived row's R2 objects are intact: metadata.json present,
  # each declared asset exists with the expected byte size (and sha256 re-check when
  # deep: true). Returns [] when OK, otherwise an array of problem strings.
  def verify(lapse_timelapse, deep: false)
    problems = []
    meta_key = "#{PREFIX}/#{lapse_timelapse.lapse_timelapse_id}/metadata.json"
    meta = fetch_json(meta_key)
    return [ "metadata.json missing/unreadable (#{meta_key})" ] if meta.nil?

    verify_video(lapse_timelapse, meta, problems, deep: deep)
    verify_thumbnail(meta, problems)
    problems
  rescue Aws::S3::Errors::ServiceError, Seahorse::Client::NetworkingError => e
    [ "R2 error: #{e.class}: #{e.message}" ]
  end

  private

  def timed(key)
    t0 = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    yield
  ensure
    @last_timings[key] = (Process.clock_gettime(Process::CLOCK_MONOTONIC) - t0).round(1)
  end

  def verify_video(lapse_timelapse, meta, problems, deep:)
    vid = meta.dig("assets", "video")
    archived = vid.is_a?(Hash) && vid["key"].present?
    # Metadata-only archive (footage-less): no checksum, no video — that's expected.
    if lapse_timelapse.archive_checksum.present? && !archived
      problems << "DB has archive_checksum but metadata.json declares no archived video"
      return
    end
    return unless archived

    head = head_object(vid["key"])
    return problems << "video object missing in R2 (#{vid['key']})" if head.nil?

    problems << "video size: R2=#{head.content_length} vs manifest=#{vid['byte_size']}" if head.content_length != vid["byte_size"]
    if lapse_timelapse.archive_video_byte_size && head.content_length != lapse_timelapse.archive_video_byte_size
      problems << "video size: R2=#{head.content_length} vs db=#{lapse_timelapse.archive_video_byte_size}"
    end
    if lapse_timelapse.archive_checksum.present? && vid["sha256"] != lapse_timelapse.archive_checksum
      problems << "checksum: manifest=#{vid['sha256']} vs db=#{lapse_timelapse.archive_checksum}"
    end
    return unless deep

    actual = download_sha256(vid["key"])
    problems << "DEEP checksum: downloaded=#{actual} vs expected=#{vid['sha256']}" if actual != vid["sha256"]
  end

  def verify_thumbnail(meta, problems)
    thumb = meta.dig("assets", "thumbnail")
    return unless thumb.is_a?(Hash) && thumb["key"].present?

    head = head_object(thumb["key"])
    if head.nil?
      problems << "thumbnail object missing in R2 (#{thumb['key']})"
    elsif head.content_length != thumb["byte_size"]
      problems << "thumbnail size: R2=#{head.content_length} vs manifest=#{thumb['byte_size']}"
    end
  end

  def head_object(key)
    with_r2_retry { client.head_object(bucket: bucket, key: key) }
  rescue Aws::S3::Errors::NotFound, Aws::S3::Errors::NoSuchKey
    nil
  end

  def fetch_json(key)
    JSON.parse(with_r2_retry { client.get_object(bucket: bucket, key: key) }.body.read)
  rescue Aws::S3::Errors::NotFound, Aws::S3::Errors::NoSuchKey, JSON::ParserError
    nil
  end

  def download_sha256(key)
    digest = Digest::SHA256.new
    client.get_object(bucket: bucket, key: key) { |chunk| digest.update(chunk) }
    digest.hexdigest
  end

  def asset_manifest(source_url, key, asset)
    return { source_url: source_url, archived: false } unless asset

    {
      source_url: source_url,
      key: key,
      content_type: asset[:content_type],
      byte_size: asset[:byte_size],
      sha256: asset[:sha256],
      ffprobe_duration: asset[:probe_duration]
    }.compact
  end

  # Confirm the downloaded footage is a real, readable video — catches truncated
  # downloads and HTML error pages a flaky CDN may serve. Returns the probed duration.
  def verify_video!(asset)
    raise Error, "Empty video download" if asset[:byte_size].to_i.zero?

    asset[:tempfile].flush
    out, status = run_ffprobe(asset[:tempfile].path)
    raise Error, "ffprobe failed on archived video" unless status&.success?

    probe = JSON.parse(out)
    has_video = Array(probe["streams"]).any? { |s| s["codec_type"] == "video" }
    duration = probe.dig("format", "duration").to_f

    raise Error, "Archived video has no video stream" unless has_video
    raise Error, "Archived video has non-positive duration (#{duration})" unless duration.positive?

    duration
  end

  # Bounded ffprobe. Keeps stdout (the JSON) and stderr (decoder warnings like
  # "[h264 @ …] …", which would otherwise corrupt the JSON if merged) on separate pipes,
  # and hard-kills the process if it hangs on a malformed/truncated file.
  def run_ffprobe(path)
    Open3.popen3("ffprobe", "-v", "error", "-show_entries", "format=duration",
                 "-show_entries", "stream=codec_type", "-of", "json", path) do |stdin, stdout, stderr, wait_thr|
      stdin.close
      out = +""
      out_reader = Thread.new { out << stdout.read }
      err_reader = Thread.new { stderr.read } # drain so a full stderr pipe can't block ffprobe
      if wait_thr.join(FFPROBE_TIMEOUT).nil?
        Process.kill("KILL", wait_thr.pid)
        [ out_reader, err_reader ].each(&:kill)
        raise Error, "ffprobe timed out after #{FFPROBE_TIMEOUT}s"
      end
      [ out_reader, err_reader ].each(&:join)
      [ out, wait_thr.value ]
    end
  rescue Errno::ESRCH
    [ nil, nil ]
  end

  # Confirm the thumbnail bytes actually decode as an image (not an error page).
  def verify_thumbnail!(asset)
    raise Error, "Empty thumbnail download" if asset[:byte_size].to_i.zero?

    asset[:tempfile].rewind
    mime = Marcel::MimeType.for(asset[:tempfile])
    raise Error, "Archived thumbnail is not an image (#{mime})" unless mime.to_s.start_with?("image/")
  ensure
    asset[:tempfile].rewind
  end

  # Download an asset, treating a 404/410 as "no footage" (returns nil → metadata-only
  # archive) rather than a hard failure. Genuine errors (5xx, timeouts) still raise.
  def download_asset(url, ext)
    download(url, default_ext: ext)
  rescue FootageGone
    nil
  end

  # Stream a URL to a tempfile, following redirects, hashing + sizing as we write.
  # Mirrors TimelapseActivityChecker#download_from_url but streams the body to disk.
  def download(url, default_ext:, redirects_left: MAX_REDIRECTS)
    uri = URI.parse(url)
    tempfile = Tempfile.new([ "lapse_archive_", default_ext ])
    tempfile.binmode
    digest = Digest::SHA256.new
    size = 0
    content_type = nil
    redirect_to = nil

    Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https",
                    open_timeout: 5, read_timeout: 30) do |http| # read_timeout caps a stalled CDN
      http.request(Net::HTTP::Get.new(uri)) do |res|
        case res
        when Net::HTTPRedirection
          redirect_to = res["location"]
        when Net::HTTPSuccess
          content_type = res["content-type"]
          res.read_body do |chunk|
            tempfile.write(chunk)
            digest.update(chunk)
            size += chunk.bytesize
          end
        when Net::HTTPNotFound, Net::HTTPGone
          raise FootageGone, "Footage gone (HTTP #{res.code}) for #{url}"
        else
          raise Error, "Download failed (HTTP #{res.code}) for #{url}"
        end
      end
    end

    if redirect_to
      tempfile.close!
      raise Error, "Too many redirects for #{url}" if redirects_left <= 0

      return download(redirect_to, default_ext: default_ext, redirects_left: redirects_left - 1)
    end

    tempfile.flush
    tempfile.rewind
    { tempfile: tempfile, ext: default_ext, content_type: content_type,
      byte_size: size, sha256: digest.hexdigest }
  rescue StandardError
    tempfile.close! if tempfile && !tempfile.closed?
    raise
  end

  def upload_file(key, asset)
    with_r2_retry do
      asset[:tempfile].rewind # re-seek each attempt (a partial upload consumes the IO)
      client.put_object(
        bucket: bucket,
        key: key,
        body: asset[:tempfile],
        content_type: asset[:content_type].presence || "application/octet-stream"
      )
    end
  end

  def upload_json(key, hash)
    body = JSON.generate(hash)
    with_r2_retry do
      client.put_object(bucket: bucket, key: key, body: body, content_type: "application/json")
    end
  end

  # Cloudflare R2 occasionally drops a TLS handshake under load (Seahorse::Client::
  # NetworkingError). Retry with backoff, rebuilding the client so it re-resolves DNS and
  # opens a fresh connection (likely off the flaky edge) instead of wasting the download.
  def with_r2_retry
    attempt = 0
    begin
      yield
    rescue Seahorse::Client::NetworkingError
      attempt += 1
      raise if attempt > UPLOAD_RETRIES

      @client = nil
      sleep(0.5 * (2**(attempt - 1))) # 0.5s, 1s, 2s, 4s
      retry
    end
  end

  def video_ext(raw, url)
    kind = raw&.dig("videoContainerKind").presence
    return ".#{kind.delete_prefix('.')}" if kind

    File.extname(URI.parse(url).path).presence || ".mp4"
  end

  def thumb_ext(url)
    File.extname(URI.parse(url).path).presence || ".jpg"
  end

  def bucket
    ENV.fetch("R2_BUCKET")
  end

  # Self-managed client built from the SAME env as the :r2 ActiveStorage service
  # (config/storage.yml). Deliberately does NOT touch ActiveStorage's tables/service,
  # and writes only under the lapse-archive/ prefix, so it cannot collide with or
  # mutate ActiveStorage's random-keyed blobs. The checksum opts match storage.yml —
  # R2 rejects aws-sdk's newer default checksums. Owns its connection so #with_r2_retry
  # can drop + rebuild it (fresh DNS/TLS) without disturbing other threads' clients.
  def client
    @client ||= Aws::S3::Client.new(
      access_key_id: ENV.fetch("R2_ACCESS_KEY_ID"),
      secret_access_key: ENV.fetch("R2_SECRET_ACCESS_KEY"),
      region: "auto",
      endpoint: ENV.fetch("R2_ENDPOINT"),
      force_path_style: true,
      request_checksum_calculation: "when_required",
      response_checksum_validation: "when_required",
      http_open_timeout: 10,
      http_read_timeout: 30, # cap a stalled upload instead of hanging the worker
      retry_limit: 2
    )
  end
end
