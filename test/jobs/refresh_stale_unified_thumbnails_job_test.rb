require "test_helper"

class RefreshStaleUnifiedThumbnailsJobTest < ActiveJob::TestCase
  # Skipping fixture loading disables transactional rollback between tests, so the
  # projects table accumulates rows from sibling tests. Assertions therefore target
  # the specific project_id we created rather than the global enqueue count.
  def setup_fixtures; end
  def teardown_fixtures; end

  setup do
    @user = TrialUser.create!(
      email: "rstu-#{SecureRandom.hex(4)}@example.com",
      display_name: "Refresh Tester",
      avatar: "https://example.com/a.png",
      timezone: "UTC",
      device_token: SecureRandom.hex(16)
    )
  end

  test "enqueues stale projects (checked_at older than STALE_AFTER)" do
    project = make_project(repo_link: "https://github.com/example/a")
    project.update_columns(unified_thumbnail_checked_at: 25.hours.ago)
    clear_enqueued_jobs

    RefreshStaleUnifiedThumbnailsJob.perform_now

    assert enqueued_for?(project.id), "expected stale project to be enqueued"
  end

  test "enqueues never-checked projects (checked_at IS NULL)" do
    project = make_project(repo_link: "https://github.com/example/b")
    project.update_columns(unified_thumbnail_checked_at: nil)
    clear_enqueued_jobs

    RefreshStaleUnifiedThumbnailsJob.perform_now

    assert enqueued_for?(project.id), "expected never-checked project to be enqueued"
  end

  test "skips fresh projects" do
    project = make_project(repo_link: "https://github.com/example/c")
    project.update_columns(unified_thumbnail_checked_at: 1.hour.ago)
    clear_enqueued_jobs

    RefreshStaleUnifiedThumbnailsJob.perform_now

    refute enqueued_for?(project.id), "fresh project should not be enqueued"
  end

  test "skips projects with blank repo_link" do
    project = make_project(repo_link: nil)
    project.update_columns(unified_thumbnail_checked_at: nil)
    clear_enqueued_jobs

    RefreshStaleUnifiedThumbnailsJob.perform_now

    refute enqueued_for?(project.id), "project without repo_link should not be enqueued"
  end

  test "skips discarded projects" do
    project = make_project(repo_link: "https://github.com/example/d")
    project.update_columns(unified_thumbnail_checked_at: nil)
    project.discard
    clear_enqueued_jobs

    RefreshStaleUnifiedThumbnailsJob.perform_now

    refute enqueued_for?(project.id), "discarded project should not be enqueued"
  end

  test "respects PER_RUN_LIMIT" do
    original_limit = RefreshStaleUnifiedThumbnailsJob::PER_RUN_LIMIT
    silence_warnings { RefreshStaleUnifiedThumbnailsJob.const_set(:PER_RUN_LIMIT, 2) }

    p1 = make_project(repo_link: "https://github.com/example/e1")
    p2 = make_project(repo_link: "https://github.com/example/e2")
    p3 = make_project(repo_link: "https://github.com/example/e3")
    [ p1, p2, p3 ].each { |p| p.update_columns(unified_thumbnail_checked_at: 10.years.ago) }
    clear_enqueued_jobs

    RefreshStaleUnifiedThumbnailsJob.perform_now

    # With limit=2, even our three super-stale projects (sorted ASC NULLS FIRST by checked_at
    # — these go to the END since they're not NULL but ANY pre-existing NULL-checked_at
    # projects come first) demonstrate the cap by total job count not exceeding 2.
    enqueued = enqueued_jobs.count { |j| j[:job] == ComputeProjectUnifiedThumbnailJob.to_s || j[:job] == ComputeProjectUnifiedThumbnailJob }
    assert_equal 2, enqueued, "expected limit cap to bound total enqueues"
  ensure
    silence_warnings { RefreshStaleUnifiedThumbnailsJob.const_set(:PER_RUN_LIMIT, original_limit) }
  end

  private

  def make_project(repo_link:)
    Project.create!(user: @user, name: "P-#{SecureRandom.hex(4)}", repo_link: repo_link)
  end

  def enqueued_for?(project_id)
    enqueued_jobs.any? do |j|
      klass = j[:job]
      klass_name = klass.is_a?(Class) ? klass.name : klass.to_s
      klass_name == "ComputeProjectUnifiedThumbnailJob" && j[:args] == [ project_id ]
    end
  end
end
