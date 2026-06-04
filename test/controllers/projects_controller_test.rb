require "test_helper"

class ProjectsControllerTest < ActionController::TestCase
  tests ProjectsController
  include ActiveJob::TestHelper

  # `fixtures :all` in test_helper hits a pre-existing schema drift in
  # test/fixtures/hcb_connections.yml (the fixture has a column the schema dropped).
  # Skip fixture loading and build records inline so this file is runnable in isolation.
  def setup_fixtures; end
  def teardown_fixtures; end

  setup do
    @owner = full_user
    @project = Project.create!(user: @owner, name: "Cover Project", repo_link: "https://github.com/example/cover")
    clear_enqueued_jobs # project creation enqueues reindex/broadcast jobs we don't assert on here
    @request.session[:user_id] = @owner.id
  end

  # ---- #refresh_cover ----

  test "refresh_cover enqueues a forced compute job and returns a microsecond since for the owner" do
    assert_enqueued_with(job: ComputeProjectUnifiedThumbnailJob) do
      post :refresh_cover, params: { id: @project.id }
    end
    assert_response :success
    since = response.parsed_body["since"]
    assert since.present?, "response should include a since timestamp"
    assert_match(/\.\d{6}/, since, "since should carry microsecond precision to avoid the same-second poll race")
  end

  test "refresh_cover redirects trial users to signin (verified-owner-only)" do
    trial = trial_user
    @request.session[:user_id] = trial.id
    assert_no_enqueued_jobs only: ComputeProjectUnifiedThumbnailJob do
      post :refresh_cover, params: { id: @project.id }
    end
    assert_redirected_to signin_path(login_hint: trial.email)
  end

  test "refresh_cover denies a non-owner full user" do
    @request.session[:user_id] = full_user.id
    assert_no_enqueued_jobs only: ComputeProjectUnifiedThumbnailJob do
      post :refresh_cover, params: { id: @project.id }
    end
    assert_redirected_to root_path
    assert_equal "You are not authorized to perform this action.", flash[:alert]
  end

  # ---- #cover_status ----

  test "cover_status reports working while checked_at has not advanced past since" do
    @project.update_columns(unified_thumbnail_checked_at: 1.hour.ago)
    get :cover_status, params: { id: @project.id, since: Time.current.iso8601(6) }
    assert_response :success
    assert_equal "working", response.parsed_body["state"]
  end

  test "cover_status reports none when the scan finished without a cover" do
    @project.update_columns(unified_thumbnail_checked_at: Time.current)
    get :cover_status, params: { id: @project.id, since: 1.hour.ago.iso8601(6) }
    assert_response :success
    body = response.parsed_body
    assert_equal "none", body["state"]
    assert_nil body["unified_thumbnail_url"]
  end

  test "cover_status reports found with a url when a cover is attached" do
    @project.unified_thumbnail.attach(io: StringIO.new("\xFF\xD8\xFF\xD9".b), filename: "cover.jpg", content_type: "image/jpeg")
    @project.update_columns(unified_thumbnail_checked_at: Time.current)
    get :cover_status, params: { id: @project.id, since: 1.hour.ago.iso8601(6) }
    assert_response :success
    body = response.parsed_body
    assert_equal "found", body["state"]
    assert body["unified_thumbnail_url"].present?, "found state should include the cover URL"
  end

  test "cover_status tolerates an unparseable since param" do
    @project.update_columns(unified_thumbnail_checked_at: Time.current)
    get :cover_status, params: { id: @project.id, since: "not-a-date" }
    assert_response :success
    assert_equal "none", response.parsed_body["state"]
  end

  test "cover_status redirects trial users to signin" do
    trial = trial_user
    @request.session[:user_id] = trial.id
    get :cover_status, params: { id: @project.id, since: Time.current.iso8601(6) }
    assert_redirected_to signin_path(login_hint: trial.email)
  end

  private

  def full_user
    User.create!(
      email: "cover-test-#{SecureRandom.hex(4)}@example.com",
      display_name: "Cover Tester",
      avatar: "/static-assets/pfp_fallback.webp",
      timezone: "UTC",
      slack_id: "U_COVER_#{SecureRandom.hex(4)}",
      hca_id: "hca-cover-#{SecureRandom.hex(4)}",
      is_banned: false,
      roles: [ "user" ],
      onboarded: true
    )
  end

  def trial_user
    TrialUser.create!(
      email: "cover-trial-#{SecureRandom.hex(4)}@example.com",
      device_token: "cover-token-#{SecureRandom.hex(4)}",
      display_name: "Trial",
      avatar: "/static-assets/pfp_fallback.webp",
      timezone: "UTC",
      is_banned: false,
      roles: []
    ).tap { |t| t.update!(onboarded: true) }
  end
end
