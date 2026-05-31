require "test_helper"

class ShipChecks::SafeHttpTest < ActiveSupport::TestCase
  def setup_fixtures; end
  def teardown_fixtures; end

  # --- IPv4 literals in disallowed ranges ----------------------------------

  test "rejects loopback IPv4" do
    assert_nil ShipChecks::SafeHttp.resolve_safe_ip("127.0.0.1")
  end

  test "rejects private 10.0.0.0/8" do
    assert_nil ShipChecks::SafeHttp.resolve_safe_ip("10.0.0.1")
    assert_nil ShipChecks::SafeHttp.resolve_safe_ip("10.255.255.254")
  end

  test "rejects private 172.16.0.0/12" do
    assert_nil ShipChecks::SafeHttp.resolve_safe_ip("172.16.0.1")
    assert_nil ShipChecks::SafeHttp.resolve_safe_ip("172.31.255.254")
  end

  test "rejects private 192.168.0.0/16" do
    assert_nil ShipChecks::SafeHttp.resolve_safe_ip("192.168.1.1")
  end

  test "rejects link-local 169.254.0.0/16 (cloud metadata)" do
    assert_nil ShipChecks::SafeHttp.resolve_safe_ip("169.254.169.254")
    assert_nil ShipChecks::SafeHttp.resolve_safe_ip("169.254.1.1")
  end

  test "rejects 0.0.0.0/8" do
    assert_nil ShipChecks::SafeHttp.resolve_safe_ip("0.0.0.0")
  end

  test "rejects carrier-grade NAT 100.64.0.0/10" do
    assert_nil ShipChecks::SafeHttp.resolve_safe_ip("100.64.0.1")
  end

  test "rejects multicast 224.0.0.0/4" do
    assert_nil ShipChecks::SafeHttp.resolve_safe_ip("239.255.255.255")
  end

  test "rejects broadcast 255.255.255.255" do
    assert_nil ShipChecks::SafeHttp.resolve_safe_ip("255.255.255.255")
  end

  # --- IPv6 literals -------------------------------------------------------

  test "rejects IPv6 loopback" do
    assert_nil ShipChecks::SafeHttp.resolve_safe_ip("::1")
  end

  test "rejects IPv6 link-local" do
    assert_nil ShipChecks::SafeHttp.resolve_safe_ip("fe80::1")
  end

  test "rejects IPv6 unique-local fc00::/7" do
    assert_nil ShipChecks::SafeHttp.resolve_safe_ip("fc00::1")
    assert_nil ShipChecks::SafeHttp.resolve_safe_ip("fd00::1")
  end

  test "rejects IPv6 unspecified ::" do
    assert_nil ShipChecks::SafeHttp.resolve_safe_ip("::")
  end

  test "rejects IPv4-mapped IPv6 pointing at private space" do
    assert_nil ShipChecks::SafeHttp.resolve_safe_ip("::ffff:127.0.0.1")
    assert_nil ShipChecks::SafeHttp.resolve_safe_ip("::ffff:169.254.169.254")
  end

  # --- Public hosts pass ---------------------------------------------------

  test "accepts public IPv4 literal" do
    assert_equal "1.1.1.1", ShipChecks::SafeHttp.resolve_safe_ip("1.1.1.1")
  end

  test "accepts hostname resolving to public IPs" do
    Resolv.stub :getaddresses, [ "140.82.112.4" ] do
      assert_equal "140.82.112.4", ShipChecks::SafeHttp.resolve_safe_ip("github.com")
    end
  end

  # --- Defense in depth ----------------------------------------------------

  test "rejects mixed public+private resolution (split-horizon DNS attack)" do
    Resolv.stub :getaddresses, [ "1.1.1.1", "10.0.0.5" ] do
      assert_nil ShipChecks::SafeHttp.resolve_safe_ip("evil.com")
    end
  end

  test "rejects host resolving exclusively to private space" do
    Resolv.stub :getaddresses, [ "192.168.1.5" ] do
      assert_nil ShipChecks::SafeHttp.resolve_safe_ip("attacker-rebind.com")
    end
  end

  test "rejects unresolvable host" do
    Resolv.stub :getaddresses, [] do
      assert_nil ShipChecks::SafeHttp.resolve_safe_ip("does-not-exist.invalid")
    end
  end

  test "rejects nil and blank host" do
    assert_nil ShipChecks::SafeHttp.resolve_safe_ip(nil)
    assert_nil ShipChecks::SafeHttp.resolve_safe_ip("")
    assert_nil ShipChecks::SafeHttp.resolve_safe_ip("   ")
  end

  test "rejects decimal-encoded IP that bypasses naive parsing" do
    # "2130706433" decodes to 127.0.0.1 via TCPSocket on most platforms but
    # Resolv doesn't recognize it as an IP — so it resolves to [] and our
    # empty-addrs branch refuses. Confirms the pinning approach closes
    # this bypass.
    assert_nil ShipChecks::SafeHttp.resolve_safe_ip("2130706433")
  end
end
