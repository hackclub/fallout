# frozen_string_literal: true

require "ipaddr"
require "resolv"

module ShipChecks
  # SSRF guard for outbound HTTP fetches against user-supplied URLs (README
  # image references, raw repo paths). Resolves the hostname to a concrete
  # IP, refuses if any resolved address falls in a private/reserved range,
  # and returns the IP so callers can pin Net::HTTP#ipaddr= to it. Pinning
  # the IP closes the DNS-rebinding TOCTOU window: the TCP connection is
  # opened against the address we validated, not whatever DNS says at
  # connect time.
  module SafeHttp
    # IPv4 ranges that must never be reached from a worker. Sourced from
    # IANA Special-Purpose Address Registry. 169.254.0.0/16 covers cloud
    # metadata services (AWS/GCP/Azure IMDS at 169.254.169.254).
    DISALLOWED_IPV4 = %w[
      0.0.0.0/8
      10.0.0.0/8
      100.64.0.0/10
      127.0.0.0/8
      169.254.0.0/16
      172.16.0.0/12
      192.0.0.0/24
      192.0.2.0/24
      192.88.99.0/24
      192.168.0.0/16
      198.18.0.0/15
      198.51.100.0/24
      203.0.113.0/24
      224.0.0.0/4
      240.0.0.0/4
      255.255.255.255/32
    ].map { |c| IPAddr.new(c) }.freeze

    DISALLOWED_IPV6 = %w[
      ::/128
      ::1/128
      64:ff9b::/96
      100::/64
      2001::/23
      2001:db8::/32
      fc00::/7
      fe80::/10
      ff00::/8
    ].map { |c| IPAddr.new(c) }.freeze

    # Returns a validated IP string suitable for Net::HTTP#ipaddr=, or nil
    # if the host is blocked. Callers should treat nil as "refuse the
    # request" — never fall through to letting Net::HTTP resolve on its own.
    def self.resolve_safe_ip(host)
      return nil if host.nil? || host.to_s.strip.empty?

      addrs = Resolv.getaddresses(host.to_s)
      return nil if addrs.empty?

      ips = addrs.filter_map { |a| safe_ipaddr(a) }
      # All-or-nothing: a host whose resolution mixes public + private IPs
      # is rejected outright. Split-horizon DNS pointing partially into the
      # local network is an SSRF signal, not a configuration we forgive.
      return nil if ips.size != addrs.size

      ips.first.to_s
    end

    def self.safe_ipaddr(raw)
      ip = IPAddr.new(raw.to_s)
      # ::ffff:1.2.3.4 → 1.2.3.4 so IPv4 ranges apply uniformly.
      ip = ip.native if ip.ipv6?
      ranges = ip.ipv4? ? DISALLOWED_IPV4 : DISALLOWED_IPV6
      return nil if ranges.any? { |r| r.include?(ip) }
      ip
    rescue IPAddr::Error
      nil
    end
  end
end
