namespace :koi do
  desc <<~DESC
    Find approved ships missing their ship_review koi award and (optionally) issue them.

    Default mode is dry-run — prints what would be issued without inserting any rows.
    Pass APPLY=1 to actually create transactions. Always idempotent: the partial
    unique index on koi_transactions(ship_id, user_id) prevents double-awards per member.
    Scans all approved ships so partially-awarded ships (some members missing) are caught.

    Filters:
      SINCE=YYYY-MM-DD       Only consider ships approved on or after this date
      EXCLUDE_SHIP_IDS=1,2   Skip these ship ids (comma-separated)

    Examples:
      bin/rake koi:reconcile_ship_reviews
      bin/rake koi:reconcile_ship_reviews APPLY=1
      bin/rake koi:reconcile_ship_reviews APPLY=1 SINCE=2026-04-01
      bin/rake koi:reconcile_ship_reviews APPLY=1 EXCLUDE_SHIP_IDS=12,15
  DESC
  task reconcile_ship_reviews: :environment do
    apply = ENV["APPLY"] == "1"
    since = ENV["SINCE"].presence && Date.parse(ENV["SINCE"])
    exclude_ids = (ENV["EXCLUDE_SHIP_IDS"] || "").split(",").filter_map { |s| Integer(s, exception: false) }

    # Track at (ship_id, user_id) level — a ship is only "done" once every member has a row.
    awarded_pairs = KoiTransaction.where(reason: "ship_review")
      .where.not(ship_id: nil)
      .pluck(:ship_id, :user_id).to_set
    ships = Ship.approved
    ships = ships.where("ships.updated_at >= ?", since.beginning_of_day) if since
    ships = ships.where.not(id: exclude_ids) if exclude_ids.any?
    ships = ships.includes(:design_review, :build_review, project: { user: {}, collaborators: :user })

    skipped_ships = 0
    # One row per eligible member per ship
    rows = ships.find_each.flat_map do |ship|
      members = ShipKoiAwarder.eligible_members(ship).reject { |m| awarded_pairs.include?([ ship.id, m.id ]) }
      if members.empty?
        skipped_ships += 1
        next []
      end
      total = ShipKoiAwarder.compute_amount(ship)
      next [] if total.zero?
      shares = ShipKoiAwarder.compute_shares(total, members, ship.project.user_id)
      members.map do |member|
        {
          ship_id: ship.id,
          user_id: member.id,
          user_display_name: member.display_name,
          project_name: ship.project.name,
          approved_public_seconds: ship.approved_public_seconds.to_i,
          hours: (ship.approved_public_seconds.to_i / 3600.0).round(2),
          total_amount: total,
          amount: shares[member.id] || 0,
          member_count: members.size
        }
      end
    end

    eligible = rows.reject { |r| r[:amount].zero? }

    mode = apply ? "APPLY" : "DRY RUN"
    puts "ship_review backfill — #{mode}"
    puts "=" * 50
    puts "Approved ships scanned:          #{ships.count}"
    puts "  Eligible member rows (un-awarded): #{eligible.size}"
    puts "  Skipped (all trial/discarded):     #{skipped_ships}"
    puts "Total koi to issue:              #{eligible.sum { |r| r[:amount] }}"
    puts ""

    by_user = eligible.group_by { |r| r[:user_id] }.transform_values do |user_rows|
      {
        display_name: user_rows.first[:user_display_name],
        ships: user_rows.size,
        koi: user_rows.sum { |r| r[:amount] }
      }
    end
    top = by_user.sort_by { |_, v| -v[:koi] }.first(10)
    puts "Top 10 recipients:"
    top.each do |uid, info|
      puts "  user_id=#{uid}  #{info[:display_name].inspect}  ships=#{info[:ships]}  koi=#{info[:koi]}"
    end
    puts ""

    puts "Per-ship breakdown (first 50 rows):"
    eligible.first(50).each do |r|
      split_note = r[:member_count] > 1 ? " (#{r[:member_count]} members, total #{r[:total_amount]})" : ""
      puts "  ship_id=#{r[:ship_id]}  user_id=#{r[:user_id]}  project=#{r[:project_name].inspect}  hours=#{r[:hours]}  koi=#{r[:amount]}#{split_note}"
    end
    puts "  …(#{eligible.size - 50} more)" if eligible.size > 50
    puts ""

    unless apply
      puts "Dry run only — no rows inserted. Re-run with APPLY=1 to issue."
      next
    end

    puts "APPLYING — creating koi transactions..."
    counts = Hash.new(0)
    Ship.where(id: eligible.map { |r| r[:ship_id] }.uniq)
        .includes(:design_review, :build_review, project: { user: {}, collaborators: :user })
        .find_each do |ship|
      ShipKoiAwarder.call(ship).each { |result| counts[result.status] += 1 }
    end
    puts "Done. Results: #{counts.inspect}"
  end
end
