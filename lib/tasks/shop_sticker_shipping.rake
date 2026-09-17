# frozen_string_literal: true

require "csv"

namespace :shop do
  desc <<~DESC
    Export a shipping list for the flat "rubber stamp" mail items — Fallout Sticker,
    Stickers, and Fallout Postcard.

    Selects shop orders for those three items (state pending by default) and combines
    everything going to the same person + shipping address into a single package row.
    A "Rubber Stamps" column summarises the package contents (e.g.
    "1x Fallout Sticker, 2x Stickers, 1x Fallout Postcard").

    Shop orders store the shipping address as a lossy formatted blob (the address
    picker drops the street line), so each order's stored address is matched back to
    the user's HCA unified-identity address to recover the full structured fields
    (line_1, city, postal_code, ...). Matching is exact-blob first, then a
    street-insensitive match on name + city/state/postal/country. HCA /me is slow, so
    identity fetches run across a thread pool; assembly is then single-threaded.
    Rows where HCA is unavailable (dead token / no match) fall back to the stored blob
    and are flagged hca_matched=NO.

    Options (ENV):
      STATES=pending          Comma-separated order states to include (default pending)
      THREADS=20              Concurrent HCA fetches (default 20)
      VERBOSE=1               Print a line per group instead of a live counter
      OUTPUT=/path/to.csv     Override output path

    Examples:
      bin/rake shop:sticker_shipping
      bin/rake shop:sticker_shipping STATES=pending,on_hold THREADS=30 VERBOSE=1
  DESC
  task sticker_shipping: :environment do
    # item name => label used in the Rubber Stamps column (order preserved in output)
    item_labels = { "Fallout Sticker" => "Fallout Sticker", "Stickers" => "Stickers", "Fallout Postcard" => "Fallout Postcard" }
    states = ENV.fetch("STATES", "pending").split(",").map(&:strip).reject(&:empty?)
    threads = Integer(ENV.fetch("THREADS", "20"))
    verbose = ENV["VERBOSE"] == "1"

    items = item_labels.keys.map { |name| ShopItem.find_by(name: name) || abort("Shop item not found: #{name.inspect}") }
    ordered_item_ids = items.map(&:id) # label ordering for the Rubber Stamps column
    label_for = items.to_h { |it| [ it.id, item_labels[it.name] ] }

    output = ENV["OUTPUT"].presence ||
      Rails.root.join("tmp", "shop_sticker_shipping_#{Time.current.strftime('%Y%m%d_%H%M%S')}.csv").to_s

    orders = ShopOrder.where(shop_item_id: ordered_item_ids, state: states).includes(:user).to_a
    groups = orders.group_by { |o| [ o.user_id, o.address.to_s ] }
    users = groups.map { |(_uid, _addr), gos| gos.first.user }.uniq(&:id)

    puts "States: #{states.join(', ')}   Items: #{items.map(&:name).join(', ')}"
    puts "Orders: #{orders.size}   Packages (person + address): #{groups.size}   Users: #{users.size}"
    puts "Threads: #{threads}   Writing to #{output}"
    puts ""

    # Preload HCA identities across a thread pool (pure HTTP, no DB access in workers).
    identities = {}
    id_mutex = Mutex.new
    queue = Queue.new
    users.each { |u| queue << u }
    done = 0
    total = users.size
    started = Process.clock_gettime(Process::CLOCK_MONOTONIC)

    workers = Array.new([ threads, total ].min) do
      Thread.new do
        loop do
          user = begin
            queue.pop(true)
          rescue ThreadError
            break
          end
          ident = fetch_hca_identity(user)
          id_mutex.synchronize do
            identities[user.id] = ident
            done += 1
            puts "  #{user.id} #{user.email} — #{ident.is_a?(Hash) ? 'ok' : ident}" if verbose
          end
        end
      end
    end

    reporter = Thread.new do
      until id_mutex.synchronize { done } >= total
        snap = id_mutex.synchronize { done }
        elapsed = Process.clock_gettime(Process::CLOCK_MONOTONIC) - started
        rate = elapsed.positive? ? snap / elapsed : 0
        print format("\r  identities %d/%d (%.1f%%)  %.1f/s   ", snap, total, 100.0 * snap / total, rate) unless verbose
        sleep 0.5
      end
    end
    workers.each(&:join)
    reporter.join
    puts "" unless verbose

    rows = []
    matched = 0
    fallbacks = []
    groups.each do |(user_id, blob), gorders|
      u = gorders.first.user
      qty_by_item = Hash.new(0)
      gorders.each { |o| qty_by_item[o.shop_item_id] += o.quantity }
      items_line = ordered_item_ids.filter_map { |id| n = qty_by_item[id]; "#{n}x #{label_for[id]}" if n.positive? }.join(", ")
      order_ids = gorders.map(&:id).sort.join(",")
      phone = gorders.map { |o| o.phone.to_s.strip }.reject(&:empty?).first
      # Rubber Stamps: a tel line (phone as stored, incl. its + country code when present)
      # followed by the package contents. The tel line is omitted when no phone is on file.
      rubber = [ (phone.present? ? "tel: #{phone}" : nil), items_line ].compact.join("\n")

      addr = match_hca_address(identities[user_id], blob)
      if addr
        matched += 1
        ident = identities[user_id]
        rows << [
          user_id, u.email, order_ids, addr["first_name"], addr["last_name"],
          ident["first_name"], ident["last_name"], phone,
          addr["line_1"].presence || addr["address"], addr["line_2"].presence,
          addr["city"], addr["state"], addr["country"], addr["postal_code"],
          rubber, "yes"
        ]
      else
        reason = identities[user_id].is_a?(Symbol) ? identities[user_id] : :no_match
        fallbacks << { user_id: user_id, email: u.email, reason: reason }
        lines = blob.split("\n").map(&:strip).reject(&:empty?)
        name = lines.first.to_s.split(" ", 2)
        city_line = lines.find { |l| l.include?(",") }.to_s.split(",").map(&:strip)
        rows << [
          user_id, u.email, order_ids, name[0], name[1], nil, nil, phone,
          nil, nil, city_line[0], city_line[1], lines.last, city_line[2],
          rubber, "NO (#{reason})"
        ]
      end
    end

    headers = %w[
      user_id email order_ids address_first_name address_last_name profile_first_name profile_last_name
      phone address_line_1 address_line_2 city state country postal_code
    ] + [ "Rubber Stamps", "hca_matched" ]

    rows.sort_by! { |r| r[0] }
    CSV.open(output, "w") do |csv|
      csv << headers
      rows.each { |r| csv << r }
    end

    elapsed = Process.clock_gettime(Process::CLOCK_MONOTONIC) - started
    puts "\nDone in #{elapsed.round}s."
    puts "  Packages:       #{groups.size}"
    puts "  HCA-matched:    #{matched}"
    puts "  Fallback rows:  #{fallbacks.size}"
    fallbacks.each { |f| puts "    user ##{f[:user_id]} #{f[:email]} (#{f[:reason]})" }
    puts "  File:           #{output}"
  end

  # Fetches one user's HCA identity. Pure HTTP + in-memory attributes — thread-safe
  # (no DB access). Returns the identity hash, or a Symbol status on failure.
  def fetch_hca_identity(user)
    user.hca_identity || :no_identity
  rescue HcaService::InvalidToken
    :dead_token
  rescue StandardError => e
    Rails.logger.warn("shop:sticker_shipping — user #{user.id} identity failed: #{e.class}: #{e.message}")
    :error
  end

  # Matches a stored order address blob back to one of the user's HCA addresses so the
  # full structured fields (incl. the street line the picker drops) can be recovered.
  def match_hca_address(identity, blob)
    return nil unless identity.is_a?(Hash) && identity["addresses"].is_a?(Array)

    addrs = identity["addresses"]
    # 1. Exact match against the (lossy) stored blob format.
    exact = addrs.find { |a| shop_hca_blob(a) == blob }
    return exact if exact

    # 2. Street-insensitive: the picker bug drops the street, so match on the fields that
    #    do survive (city + postal + country) and prefer the primary address.
    norm = blob.downcase
    cands = addrs.select { |a| [ a["city"], a["postal_code"], a["country"] ].all? { |v| v.present? && norm.include?(v.to_s.strip.downcase) } }
    return (cands.find { |a| a["primary"] } || cands.first) if cands.any?

    # 3. Single-address users: unambiguous.
    addrs.one? ? addrs.first : nil
  end

  # Replicates ShopOrdersController#hca_formatted_addresses EXACTLY (including the
  # addr["address"] key bug) so stored blobs can be matched.
  def shop_hca_blob(addr)
    [
      [ addr["first_name"], addr["last_name"] ].compact.join(" ").presence,
      addr["address"],
      addr["line_2"].presence,
      [ addr["city"], addr["state"], addr["postal_code"] ].compact.join(", "),
      addr["country"],
      addr["phone"].presence
    ].compact.join("\n")
  end
end
