require "test_helper"

class ProfessorServiceTest < ActiveSupport::TestCase
  # This service has no DB dependency, and the global `fixtures :all` in test_helper hits a
  # pre-existing schema drift in test/fixtures/hcb_connections.yml. Skipping fixture loading
  # for this file keeps the service unit tests runnable in isolation.
  def setup_fixtures; end
  def teardown_fixtures; end

  setup do
    @secret = "test-secret-do-not-leak"
    @prior_secret = ENV["PROFESSOR_API_SECRET"]
    ENV["PROFESSOR_API_SECRET"] = @secret
  end

  teardown do
    ENV["PROFESSOR_API_SECRET"] = @prior_secret
    ProfessorService.instance_variable_set(:@connection, nil) # Drop the memoized Faraday connection between tests
  end

  test "manual_add returns true on 2xx" do
    stub_connection(status: 200, body: "ok")
    assert ProfessorService.manual_add(slack_id: "U123")
  end

  test "manual_add sends slack_id and secret in JSON body" do
    captured_body = nil
    stub_connection(status: 200, body: "ok") do |env|
      captured_body = env.body
    end
    ProfessorService.manual_add(slack_id: "U123")
    payload = JSON.parse(captured_body)
    assert_equal "U123", payload["user_id"]
    assert_equal @secret, payload["secret"]
  end

  test "manual_add returns false on non-2xx" do
    stub_connection(status: 500, body: "boom")
    swallow_error_reporter { assert_not ProfessorService.manual_add(slack_id: "U123") }
  end

  test "manual_add redacts secret from Sentry body on non-2xx" do
    leaky_body = %({"error":"bad secret: #{@secret}"})
    stub_connection(status: 400, body: leaky_body)
    captured_contexts = nil
    with_stubbed(ErrorReporter, :capture_message) do |*args, **opts|
      captured_contexts = opts[:contexts]
    end
    ProfessorService.manual_add(slack_id: "U123")
    body = captured_contexts.dig(:professor, :body)
    assert_not_nil body
    assert_not_includes body, @secret, "secret leaked into Sentry payload"
    assert_includes body, "[REDACTED]"
  ensure
    restore_stubbed
  end

  test "manual_add returns false on transient network error" do
    fake_conn = Object.new
    def fake_conn.post(*)
      raise Faraday::ConnectionFailed, "down"
    end
    ProfessorService.instance_variable_set(:@connection, fake_conn)
    swallow_error_reporter { assert_not ProfessorService.manual_add(slack_id: "U123") }
  end

  test "manual_add raises ConfigError when PROFESSOR_API_SECRET missing" do
    ENV.delete("PROFESSOR_API_SECRET")
    assert_raises(ProfessorService::ConfigError) do
      ProfessorService.manual_add(slack_id: "U123")
    end
  end

  test "manual_add raises ArgumentError when slack_id blank" do
    assert_raises(ArgumentError) do
      ProfessorService.manual_add(slack_id: "")
    end
  end

  private

  # Replaces the service's memoized connection with one wired to Faraday's test adapter so we
  # never touch the network. The optional block runs inside the stubbed POST handler — use it
  # to capture or inspect the outgoing request env.
  def stub_connection(status:, body:, &block)
    stubs = Faraday::Adapter::Test::Stubs.new
    stubs.post("/manual-add") do |env|
      block&.call(env)
      [ status, {}, body ]
    end
    conn = Faraday.new(url: ProfessorService::HOST) do |b|
      b.adapter :test, stubs
    end
    ProfessorService.instance_variable_set(:@connection, conn)
  end

  # Minitest 6 dropped Object#stub — define singleton-method swap helpers inline.
  # restore_stubbed must be called in ensure to restore the original method.
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

  def swallow_error_reporter
    with_stubbed(ErrorReporter, :capture_message) { |*_args, **_opts| }
    with_stubbed(ErrorReporter, :capture_exception) { |*_args, **_opts| }
    yield
  ensure
    restore_stubbed
  end
end
