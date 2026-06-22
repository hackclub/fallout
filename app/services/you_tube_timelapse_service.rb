require "aws-sdk-s3"
require "base64"
require "digest"
require "tempfile"
require "tmpdir"
require "fileutils"
require "json"
require "open3"

# Downloads a YouTube video with yt-dlp, transcodes it into a 60× timelapse (1h real → 1min
# video, 20fps), runs the shared activity checker on that timelapse, and uploads ONLY the
# timelapse to R2. A processed video (timelapse_ready?) is thereafter treated exactly like a
# Lapse/Lookout timelapse for playback + billing (see Ship#compute_approved_public_seconds).
#
# The raw download is large and discarded after transcoding; only the small timelapse is kept.
# yt-dlp is bot-detection-prone, so auth uses a cookies file from the YT_DLP_COOKIES secret.
class YouTubeTimelapseService
  class Error < StandardError; end
  # The video can't be fetched. :gone = private/deleted/members-only (permanent — never retry).
  # :blocked = bot challenge / rate limit (transient — a later re-run may succeed).
  class Unavailable < Error
    attr_reader :reason
    def initialize(message, reason)
      super(message)
      @reason = reason
    end
  end

  PREFIX = "youtube-timelapse".freeze
  SCHEMA_VERSION = 1
  SPEEDUP = 60                # 60× → 1h real becomes 1min of video (matches Lapse/Lookout convention)
  OUTPUT_FPS = 20
  MAX_HEIGHT = 720            # bound R2 size while keeping IDE text legible for the reviewer
  UPLOAD_RETRIES = 4
  FFPROBE_TIMEOUT = 30
  YTDLP_TIMEOUT = 30.minutes.to_i  # raw downloads can be GBs; bound so one video can't pin a worker
  FFMPEG_TIMEOUT = 30.minutes.to_i
  PRESIGN_TTL = 6.hours        # comfortably outlives a review session; re-minted each render

  # yt-dlp stderr fragments that mean the video is permanently gone (vs a transient block).
  GONE_MARKERS = [
    "private video", "video unavailable", "video is unavailable", "has been removed",
    "members-only", "does not exist", "account associated with this video has been terminated",
    "removed by the uploader", "no longer available", "this video is not available"
  ].freeze

  YTDLP_DOWNLOAD_RE = /\[download\]\s+([\d.]+)%/
  FFMPEG_OUT_TIME_RE = /out_time_us=(\d+)/

  # Returns :skipped | :processed. Raises Unavailable (caller swallows) or a generic error
  # (caller re-raises) — both leave processing_status: :failed so the dashboard shows it.
  def process!(video, force: false)
    return :skipped if video.timelapse_ready? && !force

    raw = nil
    timelapse = nil

    set_status(video, :downloading, 0)
    raw = download_with_ytdlp(video) { |pct| set_progress(video, scale(pct, 0, 40)) }

    set_status(video, :transcoding, 40)
    real_seconds = probe_duration(raw.path) # authoritative real length of the source
    timelapse = transcode_timelapse(raw, real_seconds) { |pct| set_progress(video, scale(pct, 40, 90)) }
    timelapse_seconds = probe_duration(timelapse.path)
    raise Error, "Transcoded timelapse has non-positive duration" unless timelapse_seconds.positive?

    activity = TimelapseActivityChecker.new(nil).run_on_file(timelapse)

    set_status(video, :uploading, 90)
    byte_size, checksum = upload_timelapse(video, timelapse)
    upload_metadata(video, real_seconds: real_seconds, timelapse_seconds: timelapse_seconds,
                           byte_size: byte_size, checksum: checksum, activity: activity)

    video.update!(
      processed_at: Time.current,
      processing_status: :done,
      processing_progress: 100,
      processing_error: nil,
      timelapse_byte_size: byte_size,
      timelapse_checksum: checksum,
      timelapse_duration_seconds: timelapse_seconds.round,
      inactive_frame_count: activity[:inactive_frames],
      inactive_percentage: activity[:inactive_percentage],
      inactive_segments: activity[:segments],
      activity_checked_at: Time.current,
      # Backfill the billing duration only if it was never fetched — never overwrite a real value.
      duration_seconds: video.duration_seconds.presence || real_seconds.round
    )
    :processed
  rescue Unavailable => e
    mark_failed(video, e.message)
    raise
  rescue StandardError => e
    mark_failed(video, e.message)
    ErrorReporter.capture_exception(e, contexts: { youtube_timelapse: { video_id: video.video_id } })
    raise
  ensure
    raw&.close!
    timelapse&.close!
  end

  # Presigned R2 GET URL for the archived timelapse. nil unless processed.
  def presigned_playback_url(video, expires_in: PRESIGN_TTL)
    return unless video.timelapse_ready?

    Aws::S3::Presigner.new(client: client).presigned_url(
      :get_object, bucket: bucket, key: timelapse_key(video), expires_in: expires_in.to_i
    )
  rescue Aws::Errors::ServiceError, Seahorse::Client::NetworkingError => e
    ErrorReporter.capture_exception(e, contexts: { youtube_timelapse: { video_id: video.video_id, action: "presign" } })
    nil
  end

  private

  # --- yt-dlp download ---------------------------------------------------------------------

  def download_with_ytdlp(video, &progress)
    dir = Dir.mktmpdir("yt_raw_")
    cookie_file = write_cookie_file
    output_tmpl = File.join(dir, "raw.%(ext)s")

    args = [ "yt-dlp", "--no-playlist", "--no-warnings", "--newline", "--restrict-filenames",
             "--remote-components", "ejs:github",
             "-f", "bestvideo[height<=#{MAX_HEIGHT}]+bestaudio/best[height<=#{MAX_HEIGHT}]/bestvideo+bestaudio/best/18",
             "--merge-output-format", "mp4", "-o", output_tmpl ]
    args += [ "--cookies", cookie_file.path ] if cookie_file
    args += [ "--", video.video_id ]

    buffer = +""
    status = run_streaming(args, timeout: YTDLP_TIMEOUT) do |line|
      buffer << line
      buffer.replace(buffer.last(8_000)) if buffer.bytesize > 16_000 # keep tail for error classification
      if (m = YTDLP_DOWNLOAD_RE.match(line))
        progress&.call(m[1].to_f)
      end
    end
    raise classify_ytdlp_failure(buffer) unless status&.success?

    path = Dir.glob(File.join(dir, "raw.*")).max_by { |f| File.size(f) }
    raise classify_ytdlp_failure(buffer) if path.nil?

    wrap_path_as_tempfile(path, dir)
  rescue StandardError
    FileUtils.remove_entry(dir) if dir && File.directory?(dir)
    raise
  ensure
    cookie_file&.close!
  end

  def classify_ytdlp_failure(output)
    lower = output.to_s.downcase
    return Unavailable.new("YouTube video gone", :gone) if GONE_MARKERS.any? { |m| lower.include?(m) }
    return Unavailable.new("No downloadable format available (video may be DRM-protected or format-restricted)", :gone) if lower.include?("requested format is not available")

    tail = output.to_s.lines.last(10).join.strip.truncate(400)
    Unavailable.new("yt-dlp failed (likely bot challenge / rate limit)#{tail.present? ? ": #{tail}" : ""}", :blocked)
  end

  # yt-dlp cookies from the YT_DLP_COOKIES env, written to a 0600 temp file per download (removed
  # after). Returns nil when unset (download runs anonymously). A Netscape cookies.txt is multi-line
  # and tab-delimited, but our deploy requires single-line env values — so the canonical format is
  # base64 (`base64 < cookies.txt | tr -d '\n'`). Raw multi-line contents are still accepted for
  # local dev. See decode_cookies for the detection.
  def write_cookie_file
    cookies = decode_cookies(ENV["YT_DLP_COOKIES"])
    return nil if cookies.blank?

    file = Tempfile.new([ "yt_cookies_", ".txt" ])
    file.write(cookies)
    file.flush
    File.chmod(0o600, file.path) # cookies are a credential — never world-readable
    file
  end

  # A real cookies.txt always contains newlines/tabs, so if the env value has either it's already
  # raw (dev). Otherwise it's the single-line base64 form — decode it; if the decode yields the
  # tab-delimited structure we expect, use it, else fall back to the raw value untouched.
  def decode_cookies(value)
    return value if value.blank? || value.match?(/[\t\n]/)

    decoded = Base64.decode64(value)
    decoded.match?(/[\t\n]/) ? decoded : value
  end

  # --- ffmpeg transcode --------------------------------------------------------------------

  def transcode_timelapse(raw, real_seconds, &progress)
    out = Tempfile.new([ "yt_timelapse_", ".mp4" ])
    out.binmode
    expected_out = real_seconds.positive? ? real_seconds / SPEEDUP.to_f : nil

    args = [ "ffmpeg", "-y", "-i", raw.path,
             "-vf", "setpts=PTS/#{SPEEDUP},fps=#{OUTPUT_FPS},scale=-2:'min(#{MAX_HEIGHT},ih)'",
             "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "28",
             "-movflags", "+faststart", # moov atom up front so the <video> tag can stream from R2
             "-progress", "pipe:1", "-nostats", out.path ]

    status = run_streaming(args, timeout: FFMPEG_TIMEOUT) do |line|
      next unless expected_out && (m = FFMPEG_OUT_TIME_RE.match(line))
      progress&.call([ (m[1].to_f / 1_000_000.0) / expected_out * 100, 100 ].min)
    end
    raise Error, "ffmpeg transcode failed" unless status&.success?

    out.rewind
    out
  rescue StandardError
    out&.close!
    raise
  end

  # --- ffprobe -----------------------------------------------------------------------------

  def probe_duration(path)
    out, status = run_ffprobe(path)
    raise Error, "ffprobe failed" unless status&.success?

    JSON.parse(out).dig("format", "duration").to_f
  end

  def run_ffprobe(path)
    Open3.popen3("ffprobe", "-v", "error", "-show_entries", "format=duration",
                 "-of", "json", path) do |stdin, stdout, stderr, wait_thr|
      stdin.close
      out = +""
      out_reader = Thread.new { out << stdout.read }
      err_reader = Thread.new { stderr.read }
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

  # Run a command, streaming each combined output line to the block, with a hard wall-clock cap.
  def run_streaming(cmd, timeout:, &on_line)
    Open3.popen2e(*cmd) do |stdin, out, wait_thr|
      stdin.close
      reader = Thread.new do
        out.each_line do |line|
          on_line&.call(line)
        rescue StandardError
          nil
        end
      end
      if wait_thr.join(timeout).nil?
        Process.kill("KILL", wait_thr.pid) rescue nil
        reader.kill
        raise Error, "process timed out after #{timeout}s"
      end
      reader.join
      wait_thr.value
    end
  end

  # --- R2 upload ---------------------------------------------------------------------------

  def upload_timelapse(video, timelapse)
    digest = Digest::SHA256.new
    timelapse.rewind
    digest.update(timelapse.read)
    timelapse.rewind
    byte_size = timelapse.size

    with_r2_retry do
      timelapse.rewind
      client.put_object(bucket: bucket, key: timelapse_key(video), body: timelapse, content_type: "video/mp4")
    end
    [ byte_size, digest.hexdigest ]
  end

  def upload_metadata(video, real_seconds:, timelapse_seconds:, byte_size:, checksum:, activity:)
    metadata = {
      schema_version: SCHEMA_VERSION,
      processed_at: Time.current.utc.iso8601,
      video_id: video.video_id,
      source_real_seconds: real_seconds,    # ffprobe of the raw download
      timelapse_seconds: timelapse_seconds, # ffprobe of the 60× output
      speedup: SPEEDUP,
      output_fps: OUTPUT_FPS,
      max_height: MAX_HEIGHT,
      api_duration_seconds: video.duration_seconds, # YouTube API value (billing truth) for cross-check
      timelapse: { key: timelapse_key(video), byte_size: byte_size, sha256: checksum, content_type: "video/mp4" },
      activity: activity
    }
    with_r2_retry do
      client.put_object(bucket: bucket, key: "#{PREFIX}/#{video.id}/metadata.json",
                        body: JSON.generate(metadata), content_type: "application/json")
    end
  end

  def timelapse_key(video)
    "#{PREFIX}/#{video.id}/timelapse.mp4"
  end

  # R2 occasionally drops a TLS handshake under load; retry with backoff, rebuilding the client
  # so it re-resolves DNS / opens a fresh connection. Mirrors LapseArchiveService#with_r2_retry.
  def with_r2_retry
    attempt = 0
    begin
      yield
    rescue Seahorse::Client::NetworkingError
      attempt += 1
      raise if attempt > UPLOAD_RETRIES

      @client = nil
      sleep(0.5 * (2**(attempt - 1)))
      retry
    end
  end

  def bucket
    ENV.fetch("R2_BUCKET")
  end

  # Self-managed R2 client built from the same env as LapseArchiveService. Writes only under the
  # youtube-timelapse/ prefix; the checksum opts match storage.yml (R2 rejects newer defaults).
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
      http_read_timeout: 60,
      retry_limit: 2
    )
  end

  # --- progress/status bookkeeping ---------------------------------------------------------

  # update_columns: skip validations/callbacks and avoid touching updated_at churn on every tick.
  def set_status(video, status, progress)
    video.update_columns(processing_status: YouTubeVideo.processing_statuses[status.to_s], processing_progress: progress)
  end

  # Throttle DB writes — only persist when the bar moves a few points.
  def set_progress(video, progress)
    rounded = progress.round
    return if (rounded - video.processing_progress).abs < 3

    video.update_column(:processing_progress, rounded)
  end

  def mark_failed(video, message)
    video.update_columns(processing_status: YouTubeVideo.processing_statuses["failed"],
                         processing_error: message.to_s.truncate(500))
  end

  def scale(pct, lo, hi)
    lo + (pct.to_f / 100.0) * (hi - lo)
  end

  def wrap_path_as_tempfile(path, dir)
    # Expose the on-disk download as a Tempfile-like handle whose close! also removes the temp dir.
    file = File.open(path, "rb")
    file.define_singleton_method(:close!) do
      close unless closed?
      FileUtils.remove_entry(dir) if File.directory?(dir)
    end
    file
  end
end
