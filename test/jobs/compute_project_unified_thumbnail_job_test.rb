require "test_helper"

class ComputeProjectUnifiedThumbnailJobTest < ActiveJob::TestCase
  # Skip the global `fixtures :all` — the test/fixtures/hcb_connections.yml row has a
  # known schema drift that prevents the whole fixture set from loading. We create the
  # records we need explicitly.
  def setup_fixtures; end
  def teardown_fixtures; end

  setup do
    @user = TrialUser.create!(
      email: "ut-#{SecureRandom.hex(4)}@example.com",
      display_name: "Unified Tester",
      avatar: "https://example.com/a.png",
      timezone: "UTC",
      device_token: SecureRandom.hex(16)
    )
    @project = Project.create!(user: @user, name: "Test Project", repo_link: "https://github.com/example/test")
    # Create no longer enqueues a thumbnail job; we invoke the job directly with our stubs below.
    clear_enqueued_jobs
    # Minimal valid JPEG (1x1) — enough to satisfy bytes-blank? checks and let
    # ActiveStorage compute a checksum on attach.
    @jpeg_bytes = +"\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xFF\xD9".b
    @finder_calls = []
    @download_calls = []
    @transcode_calls = []
  end

  teardown do
    restore_stubbed
    Rails.cache.delete(ComputeProjectUnifiedThumbnailJob::PAUSE_CACHE_KEY)
  end

  # --- Happy paths ----------------------------------------------------------

  test "attaches thumbnail when finder + download succeed (changed)" do
    stub_finder("https://example.com/zine.png")
    stub_download_with_etag({ status: :changed, bytes: @jpeg_bytes, content_type: "image/jpeg", etag: 'W/"abc"' })
    stub_transcode(@jpeg_bytes)

    ComputeProjectUnifiedThumbnailJob.perform_now(@project.id)

    @project.reload
    assert @project.unified_thumbnail.attached?
    assert_equal "https://example.com/zine.png", @project.unified_thumbnail_source_url
    assert_equal 'W/"abc"', @project.unified_thumbnail_etag
    assert_not_nil @project.unified_thumbnail_checked_at
    assert_equal [ "image/jpeg" ], @transcode_calls.map(&:last)
  end

  test "304 fast-path bumps checked_at without re-downloading or transcoding" do
    seed_attached(source_url: "https://example.com/zine.png", etag: 'W/"v1"', checked_at: 1.day.ago)
    prior_blob_id = @project.unified_thumbnail.blob.id
    prior_checked = @project.unified_thumbnail_checked_at

    stub_finder("https://example.com/zine.png")
    stub_download_with_etag({ status: :unchanged })

    ComputeProjectUnifiedThumbnailJob.perform_now(@project.id)

    @project.reload
    assert_equal prior_blob_id, @project.unified_thumbnail.blob.id, "blob preserved on 304"
    assert @project.unified_thumbnail_checked_at > prior_checked
    assert_equal 'W/"v1"', @project.unified_thumbnail_etag, "etag preserved on 304"
    assert_equal [ [ "https://example.com/zine.png", 'W/"v1"' ] ], @download_calls
    assert_empty @transcode_calls, "transcoder must not run on 304"
  end

  test "changed content on same URL re-rasterizes and stores new etag" do
    seed_attached(source_url: "https://example.com/zine.png", etag: 'W/"v1"', checked_at: 1.day.ago)
    prior_blob_id = @project.unified_thumbnail.blob.id
    new_bytes = @jpeg_bytes + "\x00".b

    stub_finder("https://example.com/zine.png")
    stub_download_with_etag({ status: :changed, bytes: new_bytes, content_type: "image/jpeg", etag: 'W/"v2"' })
    stub_transcode(new_bytes)

    ComputeProjectUnifiedThumbnailJob.perform_now(@project.id)

    @project.reload
    assert @project.unified_thumbnail.attached?
    assert_not_equal prior_blob_id, @project.unified_thumbnail.blob.id, "blob replaced on content change"
    assert_equal 'W/"v2"', @project.unified_thumbnail_etag
    assert_equal "https://example.com/zine.png", @project.unified_thumbnail_source_url
  end

  test "source URL changed since last run skips If-None-Match" do
    seed_attached(source_url: "https://example.com/old.png", etag: 'W/"old"', checked_at: 1.day.ago)

    stub_finder("https://example.com/new.png")
    stub_download_with_etag({ status: :changed, bytes: @jpeg_bytes, content_type: "image/jpeg", etag: 'W/"new"' })
    stub_transcode(@jpeg_bytes)

    ComputeProjectUnifiedThumbnailJob.perform_now(@project.id)

    assert_equal [ [ "https://example.com/new.png", nil ] ], @download_calls, "no If-None-Match when URL changes"
    @project.reload
    assert_equal "https://example.com/new.png", @project.unified_thumbnail_source_url
    assert_equal 'W/"new"', @project.unified_thumbnail_etag
  end

  # --- Probe-on-nil (finder returned nothing, attachment exists) -----------

  test "finder nil + probe 304 keeps attachment intact" do
    seed_attached(source_url: "https://example.com/zine.png", etag: 'W/"v1"', checked_at: 1.day.ago)
    prior_blob_id = @project.unified_thumbnail.blob.id

    stub_finder(nil)
    stub_download_with_etag({ status: :unchanged })

    ComputeProjectUnifiedThumbnailJob.perform_now(@project.id)

    @project.reload
    assert @project.unified_thumbnail.attached?
    assert_equal prior_blob_id, @project.unified_thumbnail.blob.id
    assert_equal 'W/"v1"', @project.unified_thumbnail_etag
    assert_equal [ [ "https://example.com/zine.png", 'W/"v1"' ] ], @download_calls
  end

  test "finder nil + probe 200 re-rasterizes" do
    seed_attached(source_url: "https://example.com/zine.png", etag: 'W/"v1"', checked_at: 1.day.ago)
    prior_blob_id = @project.unified_thumbnail.blob.id

    stub_finder(nil)
    stub_download_with_etag({ status: :changed, bytes: @jpeg_bytes, content_type: "image/jpeg", etag: 'W/"v2"' })
    stub_transcode(@jpeg_bytes)

    ComputeProjectUnifiedThumbnailJob.perform_now(@project.id)

    @project.reload
    assert @project.unified_thumbnail.attached?
    assert_not_equal prior_blob_id, @project.unified_thumbnail.blob.id
    assert_equal 'W/"v2"', @project.unified_thumbnail_etag
  end

  test "finder nil + probe 404 purges (positive proof of removal)" do
    seed_attached(source_url: "https://example.com/old.png", etag: 'W/"old"', checked_at: 1.day.ago)

    stub_finder(nil)
    stub_download_with_etag({ status: :gone })

    ComputeProjectUnifiedThumbnailJob.perform_now(@project.id)

    @project.reload
    assert_not @project.unified_thumbnail.attached?
    assert_nil @project.unified_thumbnail_source_url
    assert_nil @project.unified_thumbnail_etag
    assert_not_nil @project.unified_thumbnail_checked_at
  end

  test "finder nil + probe error enqueues retry, attachment intact (false-purge regression)" do
    seed_attached(source_url: "https://example.com/old.png", etag: 'W/"old"', checked_at: 1.day.ago)
    prior_blob_id = @project.unified_thumbnail.blob.id

    stub_finder(nil)
    stub_download_with_etag({ status: :error, detail: "HTTP 503" })

    assert_enqueued_with(job: ComputeProjectUnifiedThumbnailJob, args: [ @project.id ]) do
      ComputeProjectUnifiedThumbnailJob.perform_now(@project.id)
    end

    @project.reload
    assert @project.unified_thumbnail.attached?, "attachment must survive transient probe error"
    assert_equal prior_blob_id, @project.unified_thumbnail.blob.id
    assert_equal 'W/"old"', @project.unified_thumbnail_etag
    assert_equal "https://example.com/old.png", @project.unified_thumbnail_source_url
  end

  test "finder nil + no attachment records check and returns" do
    stub_finder(nil)
    stub_download_with_etag  # asserts not called

    ComputeProjectUnifiedThumbnailJob.perform_now(@project.id)

    @project.reload
    assert_not @project.unified_thumbnail.attached?
    assert_not_nil @project.unified_thumbnail_checked_at
    assert_empty @download_calls, "probe should not run when there's no attachment to protect"
  end

  # --- Refresh-from-source error paths -------------------------------------

  test "finder URL + 404 enqueues retry, attachment intact" do
    seed_attached(source_url: "https://example.com/old.png", etag: 'W/"old"', checked_at: 1.day.ago)
    stub_finder("https://example.com/new.png")
    stub_download_with_etag({ status: :gone })

    assert_enqueued_with(job: ComputeProjectUnifiedThumbnailJob, args: [ @project.id ]) do
      ComputeProjectUnifiedThumbnailJob.perform_now(@project.id)
    end

    assert @project.reload.unified_thumbnail.attached?
  end

  test "finder URL + transient error enqueues retry, attachment intact" do
    seed_attached(source_url: "https://example.com/old.png", etag: 'W/"old"', checked_at: 1.day.ago)
    stub_finder("https://example.com/new.png")
    stub_download_with_etag({ status: :error, detail: "timeout" })

    assert_enqueued_with(job: ComputeProjectUnifiedThumbnailJob, args: [ @project.id ]) do
      ComputeProjectUnifiedThumbnailJob.perform_now(@project.id)
    end

    assert @project.reload.unified_thumbnail.attached?
  end

  test "too_large response skips without purge" do
    seed_attached(source_url: "https://example.com/old.png", etag: 'W/"old"', checked_at: 1.day.ago)
    stub_finder("https://example.com/zine.png")
    stub_download_with_etag({ status: :too_large, size: 100_000_000 })

    ComputeProjectUnifiedThumbnailJob.perform_now(@project.id)

    @project.reload
    assert @project.unified_thumbnail.attached?
    assert_not_nil @project.unified_thumbnail_checked_at
  end

  test "unsupported content_type from download skips without purge" do
    seed_attached(source_url: "https://example.com/old.png", etag: 'W/"old"', checked_at: 1.day.ago)
    stub_finder("https://example.com/file.bin")
    stub_download_with_etag({ status: :changed, bytes: @jpeg_bytes, content_type: "application/octet-stream", etag: 'W/"x"' })

    ComputeProjectUnifiedThumbnailJob.perform_now(@project.id)

    @project.reload
    assert @project.unified_thumbnail.attached?, "unrecognized content type shouldn't purge a working attachment"
    assert_empty @transcode_calls
  end

  test "transcoder returns nil skips attach but bumps checked_at" do
    stub_finder("https://example.com/zine.png")
    stub_download_with_etag({ status: :changed, bytes: @jpeg_bytes, content_type: "image/jpeg", etag: 'W/"x"' })
    stub_transcode(nil)

    ComputeProjectUnifiedThumbnailJob.perform_now(@project.id)

    @project.reload
    assert_not @project.unified_thumbnail.attached?
    assert_not_nil @project.unified_thumbnail_checked_at
  end

  # --- Trigger / lifecycle short-circuits ----------------------------------

  test "blank repo_link purges existing attachment and clears columns" do
    seed_attached(source_url: "https://example.com/old.png", etag: 'W/"old"', checked_at: 1.day.ago)
    @project.update_columns(repo_link: nil)
    stub_finder("https://example.com/zine.png")  # would call if not short-circuited

    ComputeProjectUnifiedThumbnailJob.perform_now(@project.id)

    @project.reload
    assert_not @project.unified_thumbnail.attached?
    assert_nil @project.unified_thumbnail_source_url
    assert_nil @project.unified_thumbnail_etag
    assert_not_nil @project.unified_thumbnail_checked_at
    assert_empty @finder_calls, "finder must not be called when repo_link is blank"
  end

  test "kill switch pauses all work" do
    # Test env uses :null_store, so stub Rails.cache.read directly for the pause key.
    with_stubbed(Rails.cache, :read) do |key, *_rest|
      key == ComputeProjectUnifiedThumbnailJob::PAUSE_CACHE_KEY ? true : nil
    end
    stub_finder("https://example.com/zine.png")

    ComputeProjectUnifiedThumbnailJob.perform_now(@project.id)

    assert_empty @finder_calls
  end

  test "no-op on discarded project" do
    @project.discard
    stub_finder("https://example.com/zine.png")

    ComputeProjectUnifiedThumbnailJob.perform_now(@project.id)

    assert_empty @finder_calls
  end

  test "no-op on missing project id" do
    assert_nothing_raised { ComputeProjectUnifiedThumbnailJob.perform_now(999_999_999) }
  end

  # --- Class config sanity --------------------------------------------------

  test "retry_on TransientError is configured" do
    transient_handler = ComputeProjectUnifiedThumbnailJob.rescue_handlers.find { |klass, _| klass == "ComputeProjectUnifiedThumbnailJob::TransientError" }
    assert transient_handler, "expected retry_on TransientError handler"
  end

  test "per-project concurrency key" do
    assert_equal 1, ComputeProjectUnifiedThumbnailJob.concurrency_limit
    job = ComputeProjectUnifiedThumbnailJob.new(@project.id)
    assert_includes job.concurrency_key, "unified_thumbnail:#{@project.id}"
  end

  private

  def seed_attached(source_url:, etag:, checked_at:)
    @project.unified_thumbnail.attach(io: StringIO.new(@jpeg_bytes), filename: "old.jpg", content_type: "image/jpeg")
    @project.update_columns(
      unified_thumbnail_source_url: source_url,
      unified_thumbnail_etag: etag,
      unified_thumbnail_checked_at: checked_at
    )
    @project.reload
  end

  def stub_finder(url)
    calls = @finder_calls
    # find_url now takes ctx:/allow_representative:/force: keywords — accept and ignore them.
    with_stubbed(ShipChecks::UnifiedScreenshotFinder, :find_url) do |project, **|
      calls << project
      url
    end
  end

  def stub_download_with_etag(*responses)
    queue = responses.dup
    calls = @download_calls
    with_stubbed(ShipChecks::UnifiedScreenshotProcessor, :download_with_etag) do |url, if_none_match: nil|
      calls << [ url, if_none_match ]
      flunk "download_with_etag called more times than stubbed (extra call for #{url.inspect})" if queue.empty?
      queue.shift
    end
  end

  def stub_transcode(bytes)
    calls = @transcode_calls
    with_stubbed(ShipChecks::UnifiedScreenshotProcessor, :transcode_to_jpeg) do |input_bytes, content_type|
      calls << [ input_bytes, content_type ]
      bytes
    end
  end

  def with_stubbed(receiver, method_name, &replacement)
    @stub_restorers ||= []
    original = receiver.method(method_name)
    receiver.define_singleton_method(method_name, replacement)
    @stub_restorers << -> { receiver.define_singleton_method(method_name, original) }
  end

  def restore_stubbed
    @stub_restorers&.each(&:call)
    @stub_restorers = nil
  end
end
