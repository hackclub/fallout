namespace :koi do
  desc <<~DESC
    Find approved ships missing their ship_review koi award and (optionally) issue them.

    Default mode is dry-run — prints what would be issued without inserting any rows.
    Pass APPLY=1 to actually create transactions. Always idempotent: the partial
    unique index on koi_transactions(ship_id) prevents double-awards regardless.

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

    awarded_ship_ids = KoiTransaction.where(reason: "ship_review").select(:ship_id)
    ships = Ship.approved.where.not(id: awarded_ship_ids)
    ships = ships.where("ships.updated_at >= ?", since.beginning_of_day) if since
    ships = ships.where.not(id: exclude_ids) if exclude_ids.any?
    ships = ships.includes(:design_review, :build_review, project: :user)

    rows = ships.find_each.map do |ship|
      amount = ShipKoiAwarder.compute_amount(ship)
      {
        ship_id: ship.id,
        user_id: ship.user.id,
        user_display_name: ship.user.display_name,
        project_name: ship.project.name,
        approved_seconds: ship.approved_seconds.to_i,
        hours: (ship.approved_seconds.to_i / 3600.0).round(2),
        amount: amount,
        trial: ship.user.trial?
      }
    end

    eligible = rows.reject { |r| r[:trial] || r[:amount].zero? }

    mode = apply ? "APPLY" : "DRY RUN"
    puts "ship_review backfill — #{mode}"
    puts "=" * 50
    puts "Approved ships missing award:    #{rows.size}"
    puts "  Eligible (non-trial, non-zero):  #{eligible.size}"
    puts "  Skipped (trial users):           #{rows.count { |r| r[:trial] }}"
    puts "  Skipped (zero amount):           #{rows.count { |r| !r[:trial] && r[:amount].zero? }}"
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

    puts "Per-ship breakdown (first 50):"
    eligible.first(50).each do |r|
      puts "  ship_id=#{r[:ship_id]}  user_id=#{r[:user_id]}  project=#{r[:project_name].inspect}  hours=#{r[:hours]}  koi=#{r[:amount]}"
    end
    puts "  …(#{eligible.size - 50} more)" if eligible.size > 50
    puts ""

    unless apply
      puts "Dry run only — no rows inserted. Re-run with APPLY=1 to issue."
      next
    end

    puts "APPLYING — creating koi transactions..."
    counts = Hash.new(0)
    eligible.each do |r|
      ship = Ship.find(r[:ship_id])
      result = ShipKoiAwarder.call(ship)
      counts[result.status] += 1
    end
    puts "Done. Results: #{counts.inspect}"
  end
end
