# == Schema Information
#
# Table name: projects
#
#  id                    :bigint           not null, primary key
#  built_irl             :boolean          default(FALSE), not null
#  demo_link             :string
#  demo_video_link       :string
#  description           :text
#  discarded_at          :datetime
#  inactivity_dm_sent_at :datetime
#  is_unlisted           :boolean          default(FALSE), not null
#  manual_seconds        :integer          default(0), not null
#  name                  :string           not null
#  repo_link             :string
#  tags                  :string           default([]), not null, is an Array
#  created_at            :datetime         not null
#  updated_at            :datetime         not null
#  user_id               :bigint           not null
#
# Indexes
#
#  index_projects_on_discarded_at  (discarded_at)
#  index_projects_on_is_unlisted   (is_unlisted)
#  index_projects_on_name_trgm     (name) USING gin
#  index_projects_on_tags          (tags) USING gin
#  index_projects_on_user_id       (user_id)
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

  test "creating a project with a repo_link enqueues ComputeProjectUnifiedThumbnailJob" do
    assert_enqueued_with(job: ComputeProjectUnifiedThumbnailJob) do
      Project.create!(user: @user, name: "P", repo_link: "https://github.com/example/p")
    end
  end

  test "creating a project without a repo_link does not enqueue the job" do
    assert_no_enqueued_jobs only: ComputeProjectUnifiedThumbnailJob do
      Project.create!(user: @user, name: "P")
    end
  end

  test "changing repo_link enqueues the job" do
    project = Project.create!(user: @user, name: "P", repo_link: "https://github.com/example/p")
    clear_enqueued_jobs

    assert_enqueued_with(job: ComputeProjectUnifiedThumbnailJob, args: [ project.id ]) do
      project.update!(repo_link: "https://github.com/example/p2")
    end
  end

  test "changing an unrelated field (name) does not enqueue the job" do
    project = Project.create!(user: @user, name: "P", repo_link: "https://github.com/example/p")
    clear_enqueued_jobs

    assert_no_enqueued_jobs only: ComputeProjectUnifiedThumbnailJob do
      project.update!(name: "Renamed")
    end
  end

  test "clearing repo_link enqueues the job (so it can purge the stale attachment)" do
    project = Project.create!(user: @user, name: "P", repo_link: "https://github.com/example/p")
    clear_enqueued_jobs

    assert_enqueued_with(job: ComputeProjectUnifiedThumbnailJob, args: [ project.id ]) do
      project.update!(repo_link: nil)
    end
  end

  test "discarding a project does not enqueue the job" do
    project = Project.create!(user: @user, name: "P", repo_link: "https://github.com/example/p")
    clear_enqueued_jobs

    assert_no_enqueued_jobs only: ComputeProjectUnifiedThumbnailJob do
      project.discard
    end
  end

  test "undiscarding a project with a repo_link enqueues the job" do
    project = Project.create!(user: @user, name: "P", repo_link: "https://github.com/example/p")
    project.discard
    clear_enqueued_jobs

    assert_enqueued_with(job: ComputeProjectUnifiedThumbnailJob, args: [ project.id ]) do
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
end
