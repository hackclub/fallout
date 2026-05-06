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
      req.params["part"] = "snippet,contentDetails"
      req.params["id"] = video_id
      req.params["key"] = youtube_api_key
    end

    unless response.success?
      ErrorReporter.capture_message("YouTube video fetch failed", level: :warning, contexts: {
        youtube: { status: response.status, video_id: video_id, source: "data_api" }
      })
      return nil
    end

    data = JSON.parse(response.body)
    item = data.dig("items", 0)
    return nil if item.nil?

    snippet = item["snippet"]
    content = item["contentDetails"]

    duration = parse_iso8601_duration(content["duration"])
    is_live = snippet["liveBroadcastContent"] != "none"

    # Reject Shorts — very short videos that aren't live streams
    return nil if duration.present? && duration <= 60 && !is_live

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
      was_live: snippet["liveBroadcastContent"] == "live",
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
    match = duration_string.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
    return nil unless match
    (match[1].to_i * 3600) + (match[2].to_i * 60) + match[3].to_i
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
