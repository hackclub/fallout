require "open3"

class TimelapseActivityChecker
  # blackframe filter: a difference frame is "inactive" when this % of pixels fall below the threshold.
  BLACKFRAME_AMOUNT = 98

  # Pixel intensity (0-255) below which a pixel in the difference frame counts as "dark" (unchanged).
  # Adjustable to account for compression noise across recording software.
  BLACKFRAME_THRESHOLD = 25

  # Frames per second to sample from the compiled timelapse.
  SAMPLE_FPS = 1

  # 1 timelapse second ≈ 1 real minute. Only flag inactivity segments >= 2 real minutes.
  MIN_INACTIVE_SECONDS = 2

  FILTER_COMPLEX = format(
    "[0:v]fps=%<sample_fps>d,format=gray,split[a][b];" \
    "[a]trim=start_frame=1,setpts=PTS-STARTPTS[shifted];" \
    "[b][shifted]blend=all_mode=difference:eof_action=endall," \
    "blackframe=amount=%<blackframe_amount>d:threshold=%<blackframe_threshold>d",
    sample_fps: SAMPLE_FPS,
    blackframe_amount: BLACKFRAME_AMOUNT,
    blackframe_threshold: BLACKFRAME_THRESHOLD
  ).freeze

  def initialize(recordable)
    @recordable = recordable
  end

  def run
    video_file = download_video
    return empty_result unless video_file

    run_on_file(video_file)
  ensure
    video_file&.close!
  end

  # Analyze a video file directly (for testing without a record).
  def self.run_on_file(file)
    new(nil).run_on_file(file)
  end

  def run_on_file(file)
    ffmpeg_input = prepare_ffmpeg_input(file)
    return empty_result unless ffmpeg_input

    output = run_ffmpeg_analysis(ffmpeg_input.path)
    return empty_result if output.nil?

    total_pairs, inactive_indices = parse_ffmpeg_output(output)
    return empty_result if total_pairs < 1

    segments = collapse_into_segments(inactive_indices)
      .select { |s| s[:duration_min] >= MIN_INACTIVE_SECONDS }

    inactive_frame_count = segments.sum { |s| s[:duration_min] }

    {
      inactive_frames: inactive_frame_count,
      total_frames: total_pairs + 1,
      inactive_percentage: total_pairs > 0 ? (inactive_frame_count.to_f / total_pairs * 100).round(1) : 0.0,
      segments: segments
    }
  ensure
    ffmpeg_input&.close!
  end

  private

  def download_video
    case @recordable
    when LookoutTimelapse
      LookoutService.download_video(@recordable.session_token)
    when LapseTimelapse
      download_from_url(@recordable.playback_url)
    when YouTubeVideo
      nil # YouTube downloads are unreliable due to bot detection; skip activity checking
    end
  end

  def download_from_url(url)
    return nil if url.blank?

    ext = File.extname(URI.parse(url).path).presence || ".mp4"
    tempfile = Tempfile.new([ "video_", ext ])
    tempfile.binmode

    uri = URI.parse(url)
    response = Net::HTTP.get_response(uri)
    3.times do
      break unless response.is_a?(Net::HTTPRedirection)
      uri = URI.parse(response["location"])
      response = Net::HTTP.get_response(uri)
    end

    unless response.is_a?(Net::HTTPSuccess)
      tempfile.close!
      return nil
    end

    tempfile.write(response.body)
    tempfile.rewind
    tempfile
  rescue StandardError => e
    ErrorReporter.capture_exception(e, contexts: { activity_check: { action: "download_from_url" } })
    tempfile&.close!
    nil
  end

  # Single ffmpeg pass: sample at 1fps, convert to grayscale, compute consecutive frame
  # differences via shift-and-subtract, then detect black (inactive) frames.
  def run_ffmpeg_analysis(path)
    output, status = Open3.capture2e(
      "ffmpeg", "-i", path,
      "-filter_complex", FILTER_COMPLEX,
      "-f", "null", "-"
    )

    status.success? ? output : nil
  end

  def parse_ffmpeg_output(output)
    # blackframe reports only inactive (black) frames:
    #   [Parsed_blackframe_0 @ 0x...] frame:5 pblack:100 pts:5 t:5.000000
    inactive_indices = output.scan(/\[Parsed_blackframe.*?\]\s*frame:(\d+)\s+pblack:(\d+)/)
      .map { |frame, _| frame.to_i }

    # Total difference frames from ffmpeg progress output (frame= counter)
    total_pairs = output.scan(/frame=\s*(\d+)/).flatten.map(&:to_i).max || 0

    [ total_pairs, inactive_indices ]
  end

  def collapse_into_segments(inactive_indices)
    return [] if inactive_indices.empty?

    segments = []
    start_min = inactive_indices.first
    prev = start_min

    inactive_indices.drop(1).each do |i|
      if i == prev + 1
        prev = i
      else
        segments << { start_min: start_min, end_min: prev + 1, duration_min: prev + 1 - start_min + 1 }
        start_min = i
        prev = i
      end
    end

    segments << { start_min: start_min, end_min: prev + 1, duration_min: prev + 1 - start_min + 1 }
    segments
  end

  def empty_result
    { inactive_frames: 0, total_frames: 0, inactive_percentage: 0.0, segments: [] }
  end

  def prepare_ffmpeg_input(file)
    input = Tempfile.new([ "ffmpeg_input_", ".mp4" ])
    input.binmode

    if file.respond_to?(:rewind)
      file.rewind
      IO.copy_stream(file, input)
    else
      IO.copy_stream(file.to_s, input.path)
    end

    input.rewind
    input
  rescue StandardError => e
    ErrorReporter.capture_exception(e, contexts: { activity_check: { action: "prepare_ffmpeg_input" } })
    input&.close!
    nil
  end
end
