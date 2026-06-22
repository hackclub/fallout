require "test_helper"

# Guards the core invariant of the YouTube→60×-timelapse feature: a PROCESSED YouTube video must
# bill exactly like an equivalent Lapse/Lookout timelapse, while an UNprocessed one keeps the
# stretch_multiplier path. If any type-branch in compute_approved_public_seconds drifts, this fails.
class ShipBillingParityTest < ActiveSupport::TestCase
  REMOVED_SEGMENT = { "type" => "removed", "start_seconds" => 10, "end_seconds" => 20 }.freeze

  test "processed YouTube bills identically to an equivalent Lapse timelapse" do
    lapse = LapseTimelapse.create!(lapse_timelapse_id: "parity-lapse", duration: 3600,
                                   user: projects(:one).user, visibility: "PUBLIC",
                                   playback_url: "https://example.test/v.mp4")
    ship_l, rec_l = ship_with(lapse, projects(:one))

    yt = YouTubeVideo.create!(video_id: "parityYTvid0", duration_seconds: 3600,
                              processing_status: :done, processed_at: Time.current)
    ship_y, rec_y = ship_with(yt, projects(:two))

    assert yt.timelapse_ready?, "fixture YouTube video should be processed"

    lapse_seconds = ship_l.compute_approved_public_seconds(annotations_for(rec_l))
    yt_seconds = ship_y.compute_approved_public_seconds(annotations_for(rec_y))

    # 3600 base − (10s timelapse segment × 60) = 3000
    assert_equal 3000, lapse_seconds
    assert_equal lapse_seconds, yt_seconds, "processed YouTube must bill like a Lapse timelapse (segments ×60)"
  end

  test "unprocessed YouTube still bills via stretch_multiplier (default 1)" do
    yt = YouTubeVideo.create!(video_id: "rawYTvideo00", duration_seconds: 3600, processing_status: :pending)
    ship, rec = ship_with(yt, projects(:one))

    refute yt.timelapse_ready?
    # 3600 base − (10s segment × stretch 1) = 3590 — distinct from the processed result above.
    assert_equal 3590, ship.compute_approved_public_seconds(annotations_for(rec))
  end

  private

  def ship_with(recordable, project)
    ship = Ship.create!(project: project, status: :pending)
    entry = JournalEntry.create!(project: project, user: project.user, content: "work")
    rec = Recording.create!(journal_entry: entry, user: project.user, recordable: recordable)
    [ ship, rec ]
  end

  def annotations_for(rec)
    { "recordings" => { rec.id.to_s => { "segments" => [ REMOVED_SEGMENT ] } } }
  end
end
