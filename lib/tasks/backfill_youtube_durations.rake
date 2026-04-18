desc "Refetch duration for YouTube videos stored with nil duration_seconds (API fallback to oEmbed)"
task backfill_youtube_durations: :environment do
  videos = YouTubeVideo.where(duration_seconds: nil)
  puts "Found #{videos.count} videos with nil duration."
  fixed = 0
  failed = 0

  videos.find_each do |video|
    video.refetch_data!
    puts "  Fixed: #{video.video_id} — #{video.duration_seconds}s"
    fixed += 1
  rescue StandardError => e
    puts "  Failed: #{video.video_id} — #{e.message}"
    failed += 1
  end

  puts "Done. Fixed #{fixed}, failed #{failed}."
end
