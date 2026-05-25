require "test_helper"

class ProfessorEnrollmentsControllerTest < ActionController::TestCase
  tests ProfessorEnrollmentsController

  # `fixtures :all` in test_helper hits a pre-existing schema drift in
  # test/fixtures/hcb_connections.yml (the fixture file has a column the schema dropped).
  # Skip fixture loading and build users inline so this file is runnable in isolation.
  def setup_fixtures; end
  def teardown_fixtures; end

  setup do
    @user = User.create!(
      email: "prof-enroll-test-#{SecureRandom.hex(4)}@example.com",
      display_name: "Test User",
      avatar: "/static-assets/pfp_fallback.webp",
      timezone: "UTC",
      slack_id: "U_FULL_USER",
      hca_id: "hca-prof-test-#{SecureRandom.hex(4)}",
      is_banned: false,
      roles: [ "user" ],
      onboarded: true
    )
    @request.session[:user_id] = @user.id
  end

  teardown do
    restore_stubbed
  end

  # ---- #new ----

  test "new redirects trial users to signin (verified-user-only)" do
    trial = trial_user
    @request.session[:user_id] = trial.id
    get :new
    assert_redirected_to signin_path(login_hint: trial.email)
  end

  test "new redirects ineligible verified user (no slack_id) to bulletin board" do
    @user.update_columns(slack_id: nil) # update_columns bypasses presence validation to reach the rare ineligible state
    get :new
    assert_redirected_to bulletin_board_path
    assert_equal "You need a full Hack Club account with a linked Slack to sign up for a mentor.", flash[:alert]
  end

  test "new redirects already-enrolled users with notice" do
    @user.update!(professor_enrolled_at: Time.current)
    get :new
    assert_redirected_to bulletin_board_path
    assert_match(/already signed up/, flash[:notice])
  end

  test "new renders inertia for eligible non-enrolled user" do
    @request.headers["X-Inertia"] = "true"
    get :new
    assert_response :success
  end

  # ---- #create ----

  test "create rejects trial users at the auth layer" do
    trial = trial_user
    @request.session[:user_id] = trial.id
    post :create
    assert_redirected_to signin_path(login_hint: trial.email)
    assert_nil trial.reload.professor_enrolled_at
  end

  test "create returns 204 and stamps timestamp on modal success" do
    @request.headers["X-InertiaUI-Modal"] = "modal-1"
    captured_slack_id = nil
    with_stubbed(ProfessorService, :manual_add) do |slack_id:|
      captured_slack_id = slack_id
      true
    end
    freeze_time do
      post :create
      assert_response :no_content
      assert_equal "U_FULL_USER", captured_slack_id
      assert_equal Time.current, @user.reload.professor_enrolled_at
    end
  end

  test "create returns 422 on API failure for modal requests" do
    @request.headers["X-InertiaUI-Modal"] = "modal-1"
    with_stubbed(ProfessorService, :manual_add) { |slack_id:| false }
    post :create
    assert_response :unprocessable_entity
    assert_nil @user.reload.professor_enrolled_at
  end

  test "create returns 503 on ConfigError for modal requests" do
    @request.headers["X-InertiaUI-Modal"] = "modal-1"
    with_stubbed(ProfessorService, :manual_add) { |slack_id:| raise ProfessorService::ConfigError, "missing secret" }
    with_stubbed(ErrorReporter, :capture_exception) { |*_args, **_opts| }
    post :create
    assert_response :service_unavailable
    assert_nil @user.reload.professor_enrolled_at
  end

  test "create returns 204 no-op for already-enrolled modal request" do
    @user.update!(professor_enrolled_at: 1.day.ago)
    @request.headers["X-InertiaUI-Modal"] = "modal-1"
    call_count = 0
    with_stubbed(ProfessorService, :manual_add) do |slack_id:|
      call_count += 1
      true
    end
    post :create
    assert_response :no_content
    assert_equal 0, call_count, "manual_add should not be called when already enrolled"
  end

  test "create rejects ineligible user (no slack_id) with 403" do
    @user.update_columns(slack_id: nil)
    @request.headers["X-InertiaUI-Modal"] = "modal-1"
    post :create
    assert_response :forbidden
  end

  test "create redirects ineligible non-modal user with alert" do
    @user.update_columns(slack_id: nil)
    post :create
    assert_redirected_to bulletin_board_path
    assert_match(/full Hack Club account with a linked Slack/, flash[:alert])
  end

  test "create redirects non-modal success to bulletin board with notice" do
    @request.headers["Referer"] = "http://test.host/path"
    with_stubbed(ProfessorService, :manual_add) { |slack_id:| true }
    post :create
    assert_redirected_to bulletin_board_path
    assert_match(/signed up for a mentor/, flash[:notice])
  end

  private

  def trial_user
    TrialUser.create!(
      email: "trial-prof-#{SecureRandom.hex(4)}@example.com",
      device_token: "trial-token-#{SecureRandom.hex(4)}",
      display_name: "Trial",
      avatar: "/static-assets/pfp_fallback.webp",
      timezone: "UTC",
      is_banned: false,
      roles: []
    ).tap { |t| t.update!(onboarded: true) }
  end

  # Minitest 6 dropped Object#stub. with_stubbed swaps a singleton method on a module/class;
  # restore_stubbed (called from teardown) restores all swapped methods.
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
