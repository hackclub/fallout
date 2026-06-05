require "faraday"
require "json"

module YouTubeService
  class Error < StandardError; end

  VIDEO_ID_REGEX = %r{(?:youtube\.com/(?:watch\?.*v=|embed/|live/)|youtu\.be/)([a-zA-Z0-9_-]{11})}
  SHORTS_REGEX = %r{youtube\.com/shorts/}
  THUMBNAIL_QUALITIES = %w[default mqdefault hqdefault sddefault maxresdefault].freeze

  module_function

  def find_or_fetch(url)
    video_id = extract_video_id(url)
    return nil if video_id.blank?

    video = YouTubeVideo.find_by(video_id: video_id)
    if video
      YouTubeVideoRefetchJob.perform_later(video.id) if video.duration_seconds.nil?
      return video
    end

    fetch_and_create(video_id, url: url)
  end

  def thumbnail_url(url, quality: "default")
    video_id = extract_video_id(url)
    return nil if video_id.blank?

    thumbnail_url_from_id(video_id, quality: quality)
  end

  def thumbnail_url_from_id(video_id, quality: "default")
    quality_key = THUMBNAIL_QUALITIES.include?(quality) ? quality : "default"
    "https://i.ytimg.com/vi/#{video_id}/#{quality_key}.jpg"
  end

  def extract_video_id(url)
    return nil if url.blank?
    return nil if url.to_s.match?(SHORTS_REGEX)
    url.to_s.match(VIDEO_ID_REGEX)&.[](1)
  end

  def fetch_and_create(video_id, url: nil)
    attrs = fetch_video_data(video_id, url: url)
    return nil if attrs.nil?

    video = YouTubeVideo.create!(attrs.merge(last_refreshed_at: Time.current))
    YouTubeVideoRefetchJob.perform_later(video.id) if video.duration_seconds.nil?
    # Re-fetch after 1 day for recently ended live streams so YouTube's processed duration replaces the fallback.
    YouTubeVideoRefetchJob.set(wait: 1.day).perform_later(video.id) if video.was_live?
    video
  rescue Faraday::Error
    nil
  rescue ActiveRecord::RecordNotUnique
    YouTubeVideo.find_by(video_id: video_id)
  end

  def fetch_video_data(video_id, url: nil)
    fetch_video_data_from_api(video_id) || fetch_video_data_from_oembed(video_id, url: url)
  end

  def fetch_video_data_from_api(video_id)
    return nil if youtube_api_key.blank?

    response = google_connection.get("/youtube/v3/videos") do |req|
      req.headers["Accept"] = "application/json"
      req.params["part"] = "snippet,contentDetails,liveStreamingDetails"
      req.params["id"] = video_id
      req.params["key"] = youtube_api_key
    end

    unless response.success?
      ErrorReporter.capture_message("YouTube video fetch failed", level: :warning, contexts: {
        youtube: { status: response.status, video_id: video_id, source: "data_api", body: response.body.to_s.first(500) }
      })
      return nil
    end

    data = JSON.parse(response.body)
    item = data.dig("items", 0)
    return nil if item.nil?

    snippet = item["snippet"]
    content = item["contentDetails"]
    streaming = item["liveStreamingDetails"]

    duration = parse_iso8601_duration(content["duration"])
    # For recently ended live streams, YouTube may return "P0D" until processing completes.
    # Fall back to actualEndTime - actualStartTime from liveStreamingDetails.
    if duration.nil? || duration == 0
      start_time = streaming&.dig("actualStartTime")
      end_time = streaming&.dig("actualEndTime")
      duration = (Time.parse(end_time) - Time.parse(start_time)).to_i if start_time.present? && end_time.present?
    end
    # `liveBroadcastContent` is "live"/"upcoming" only while the stream is active;
    # finished live streams return "none". `liveStreamingDetails.actualStartTime`
    # is set on any video that was ever a live broadcast (past or present).
    was_live = snippet["liveBroadcastContent"] != "none" || streaming&.dig("actualStartTime").present?

    # Reject Shorts — very short videos that aren't live streams
    return nil if duration.present? && duration <= 60 && !was_live

    {
      video_id: video_id,
      title: snippet["title"],
      description: snippet["description"],
      channel_id: snippet["channelId"],
      channel_title: snippet["channelTitle"],
      thumbnail_url: thumbnail_url_from_id(video_id, quality: "maxresdefault"),
      duration_seconds: duration,
      published_at: snippet["publishedAt"],
      definition: content["definition"],
      caption: content["caption"] == "true",
      was_live: was_live,
      live_broadcast_content: snippet["liveBroadcastContent"],
      tags: snippet["tags"],
      category_id: snippet["categoryId"]
    }
  rescue Faraday::Error
    raise # let the job retry on transient network failures
  rescue StandardError => e
    ErrorReporter.capture_exception(e, level: :warning, contexts: { youtube: { action: "fetch_video_data_from_api", video_id: video_id } })
    nil
  end

  def fetch_video_data_from_oembed(video_id, url: nil)
    response = oembed_connection.get("/oembed") do |req|
      req.headers["Accept"] = "application/json"
      req.params["url"] = url.presence || youtube_url(video_id)
      req.params["format"] = "json"
    end

    unless response.success?
      ErrorReporter.capture_message("YouTube oEmbed fetch failed", level: :warning, contexts: {
        youtube: { status: response.status, video_id: video_id, source: "oembed" }
      })
      return nil
    end

    data = JSON.parse(response.body)
    was_live = url.to_s.include?("/live/")

    {
      video_id: video_id,
      title: data["title"],
      description: nil,
      channel_id: nil,
      channel_title: data["author_name"],
      thumbnail_url: data["thumbnail_url"].presence || thumbnail_url_from_id(video_id, quality: "hqdefault"),
      duration_seconds: nil,
      published_at: nil,
      definition: nil,
      caption: nil,
      was_live: was_live,
      live_broadcast_content: was_live ? "live" : nil,
      tags: nil,
      category_id: nil
    }
  rescue Faraday::Error
    raise # let the job retry on transient network failures
  rescue StandardError => e
    ErrorReporter.capture_exception(e, level: :warning, contexts: { youtube: { action: "fetch_video_data_from_oembed", video_id: video_id } })
    nil
  end

  def parse_iso8601_duration(duration_string)
    return nil if duration_string.blank?
    # YouTube uses a days component for videos >= 24h (e.g. a 30h video is "P1DT6H1S"),
    # which the old PT-only regex couldn't match.
    match = duration_string.match(/\AP(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?\z/)
    return nil unless match
    days, hours, minutes, seconds = match.captures.map(&:to_i)
    (days * 86_400) + (hours * 3_600) + (minutes * 60) + seconds
  end

  def youtube_api_key
    ENV["YOUTUBE_API_KEY"].presence || ENV["GOOGLE_CLOUD_API_KEY"].presence
  end

  def youtube_url(video_id)
    "https://www.youtube.com/watch?v=#{video_id}"
  end

  def google_connection
    @google_connection ||= Faraday.new(url: "https://www.googleapis.com") do |f|
      f.options.open_timeout = 5
      f.options.timeout = 10
    end
  end

  def oembed_connection
    @oembed_connection ||= Faraday.new(url: "https://www.youtube.com") do |f|
      f.options.open_timeout = 5
      f.options.timeout = 10
    end
  end
end
