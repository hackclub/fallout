# == Schema Information
#
# Table name: projects
#
#  id                           :bigint           not null, primary key
#  built_irl                    :boolean          default(FALSE), not null
#  demo_link                    :string
#  demo_video_link              :string
#  description                  :text
#  discarded_at                 :datetime
#  inactivity_dm_sent_at        :datetime
#  is_unlisted                  :boolean          default(FALSE), not null
#  manual_seconds               :integer          default(0), not null
#  name                         :string           not null
#  repo_link                    :string
#  tags                         :string           default([]), not null, is an Array
#  unified_thumbnail_checked_at :datetime
#  unified_thumbnail_etag       :string
#  unified_thumbnail_source_url :string
#  created_at                   :datetime         not null
#  updated_at                   :datetime         not null
#  user_id                      :bigint           not null
#
# Indexes
#
#  index_projects_on_discarded_at                  (discarded_at)
#  index_projects_on_is_unlisted                   (is_unlisted)
#  index_projects_on_name_trgm                     (name) USING gin
#  index_projects_on_search_tsvector               (((to_tsvector('simple'::regconfig, COALESCE((name)::text, ''::text)) || to_tsvector('simple'::regconfig, COALESCE(description, ''::text))))) USING gin
#  index_projects_on_tags                          (tags) USING gin
#  index_projects_on_unified_thumbnail_checked_at  (unified_thumbnail_checked_at)
#  index_projects_on_user_id                       (user_id)
#
# Foreign Keys
#
#  fk_rails_...  (user_id => users.id)
#
require "test_helper"

class ProjectTest < ActiveSupport::TestCase
  include ActiveJob::TestHelper

  # The global `fixtures :all` hits a pre-existing schema drift in
  # test/fixtures/hcb_connections.yml. Skip fixture loading and build the records we need.
  def setup_fixtures; end
  def teardown_fixtures; end

  setup do
    @user = TrialUser.create!(
      email: "ptest-#{SecureRandom.hex(4)}@example.com",
      display_name: "Project Tester",
      avatar: "https://example.com/a.png",
      timezone: "UTC",
      device_token: SecureRandom.hex(16)
    )
  end

  test "creating a project with a repo_link does not enqueue ComputeProjectUnifiedThumbnailJob" do
    # A freshly linked repo has no zine yet — discovery happens on demand, at preflight, and at ship.
    assert_no_enqueued_jobs only: ComputeProjectUnifiedThumbnailJob do
      Project.create!(user: @user, name: "P", repo_link: "https://github.com/example/p")
    end
  end

  test "creating a project without a repo_link does not enqueue the job" do
    assert_no_enqueued_jobs only: ComputeProjectUnifiedThumbnailJob do
      Project.create!(user: @user, name: "P")
    end
  end

  test "changing repo_link to a different repo clears the stale cover synchronously without scanning" do
    project = Project.create!(user: @user, name: "P", repo_link: "https://github.com/example/p")
    seed_cover(project, source_url: "https://raw.githubusercontent.com/example/p/main/zine.png", etag: 'W/"a"')
    assert project.unified_thumbnail.attached?
    clear_enqueued_jobs

    # Old cover must go immediately, but a different repo doesn't mean a zine exists there yet — no blind scan.
    assert_no_enqueued_jobs only: ComputeProjectUnifiedThumbnailJob do
      project.update!(repo_link: "https://github.com/example/p2")
    end

    project.reload
    assert_not project.unified_thumbnail.attached?, "stale cover should be purged when the repo changes"
    assert_nil project.unified_thumbnail_source_url
    assert_nil project.unified_thumbnail_etag
  end

  test "changing an unrelated field (name) does not enqueue the job" do
    project = Project.create!(user: @user, name: "P", repo_link: "https://github.com/example/p")
    clear_enqueued_jobs

    assert_no_enqueued_jobs only: ComputeProjectUnifiedThumbnailJob do
      project.update!(name: "Renamed")
    end
  end

  test "clearing repo_link purges the stale cover synchronously without scanning" do
    project = Project.create!(user: @user, name: "P", repo_link: "https://github.com/example/p")
    seed_cover(project, source_url: "https://raw.githubusercontent.com/example/p/main/zine.png", etag: 'W/"a"')
    assert project.unified_thumbnail.attached?
    clear_enqueued_jobs

    assert_no_enqueued_jobs only: ComputeProjectUnifiedThumbnailJob do
      project.update!(repo_link: nil)
    end

    project.reload
    assert_not project.unified_thumbnail.attached?, "stale cover should be purged when the repo is cleared"
    assert_nil project.unified_thumbnail_source_url
    assert_nil project.unified_thumbnail_etag
  end

  test "discarding a project does not enqueue the job" do
    project = Project.create!(user: @user, name: "P", repo_link: "https://github.com/example/p")
    clear_enqueued_jobs

    assert_no_enqueued_jobs only: ComputeProjectUnifiedThumbnailJob do
      project.discard
    end
  end

  test "undiscarding a project with a repo_link does not enqueue the job" do
    project = Project.create!(user: @user, name: "P", repo_link: "https://github.com/example/p")
    project.discard
    clear_enqueued_jobs

    assert_no_enqueued_jobs only: ComputeProjectUnifiedThumbnailJob do
      project.undiscard
    end
  end

  test "undiscarding a project without a repo_link does not enqueue the job" do
    project = Project.create!(user: @user, name: "P")
    project.discard
    clear_enqueued_jobs

    assert_no_enqueued_jobs only: ComputeProjectUnifiedThumbnailJob do
      project.undiscard
    end
  end

  private

  # Minimal valid 1x1 JPEG — enough for ActiveStorage to attach and compute a checksum.
  JPEG_BYTES = "\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xFF\xD9".b.freeze

  def seed_cover(project, source_url:, etag:)
    project.unified_thumbnail.attach(io: StringIO.new(JPEG_BYTES.dup), filename: "old.jpg", content_type: "image/jpeg")
    project.update_columns(
      unified_thumbnail_source_url: source_url,
      unified_thumbnail_etag: etag,
      unified_thumbnail_checked_at: 1.day.ago
    )
    project.reload
  end
end
