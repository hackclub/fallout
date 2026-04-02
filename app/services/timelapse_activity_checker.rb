class TimelapseActivityChecker
  # Hamming distance threshold: frames with distance below this are considered identical.
  # Accounts for JPEG compression artifacts across re-encoded frames.
  SIMILARITY_THRESHOLD = 5

  # dHash dimensions: 9 wide (to compute 8 horizontal gradients) x 8 tall = 64-bit hash
  HASH_WIDTH = 9
  HASH_HEIGHT = 8

  def initialize(lookout_timelapse)
    @timelapse = lookout_timelapse
  end

  def run
    video_file = LookoutService.download_video(@timelapse.session_token)
    raise "Failed to download video for timelapse #{@timelapse.id}" unless video_file

    run_on_file(video_file)
  ensure
    video_file&.close!
  end

  # Analyze a video file directly (for testing without a LookoutTimelapse record).
  def self.run_on_file(file)
    new(nil).run_on_file(file)
  end

  def run_on_file(file)
    frames_dir = extract_frames(file)
    frame_paths = Dir.glob(File.join(frames_dir, "frame_*.jpg")).sort
    return empty_result if frame_paths.size < 2

    hashes = frame_paths.map { |path| dhash(path) }
    analyze_activity(hashes)
  ensure
    FileUtils.rm_rf(frames_dir) if frames_dir
  end

  private

  def extract_frames(video_file)
    dir = Dir.mktmpdir("timelapse_frames_")

    # Extract at 1fps — compiled timelapses play at 30fps, but each original
    # screenshot is held for 30 frames. 1fps gives us the actual screenshots.
    success = system(
      "ffmpeg", "-i", video_file.path,
      "-vf", "fps=1",
      "-q:v", "2",
      File.join(dir, "frame_%04d.jpg"),
      %i[out err] => File::NULL
    )

    raise "FFmpeg frame extraction failed" unless success

    dir
  end

  def dhash(image_path)
    image = MiniMagick::Image.open(image_path)
    image.combine_options do |c|
      c.resize "#{HASH_WIDTH}x#{HASH_HEIGHT}!"
      c.colorspace "Gray"
      c.depth 8
    end

    pixels = image.get_pixels.flatten
    hash = 0

    HASH_HEIGHT.times do |y|
      (HASH_WIDTH - 1).times do |x|
        left = pixels[y * HASH_WIDTH + x]
        right = pixels[y * HASH_WIDTH + x + 1]
        hash = (hash << 1) | (left < right ? 1 : 0)
      end
    end

    hash
  end

  def hamming_distance(hash_a, hash_b)
    (hash_a ^ hash_b).to_s(2).count("1")
  end

  def analyze_activity(hashes)
    total_frames = hashes.size
    inactive_pairs = []

    hashes.each_cons(2).with_index do |(a, b), i|
      inactive_pairs << i if hamming_distance(a, b) < SIMILARITY_THRESHOLD
    end

    segments = collapse_into_segments(inactive_pairs)

    {
      inactive_frames: inactive_pairs.size,
      total_frames: total_frames,
      inactive_percentage: (inactive_pairs.size.to_f / (total_frames - 1) * 100).round(1),
      segments: segments
    }
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
end
