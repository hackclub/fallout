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
      shares = ShipKoiAwarder.compute_shares(total, members, ship.project.user_id, ShipKoiAwarder.member_weights(ship, members))
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

  desc <<~DESC
    Redistribute already-awarded ship_review currency from the old even split to the new
    per-contribution (per-entry, proportional to attributed hours) split.

    CURRENCY=koi (default) rewrites KoiTransaction rows (design ships); CURRENCY=gold rewrites
    GoldTransaction rows (build ships). Both currencies are summed live from their ledgers
    (User#koi / User#gold), so rewriting rows is all that's needed — no counter to reconcile.

    Dry-run by default — prints every change and FLAGS any user whose resulting balance would go
    negative, touching nothing. Pass APPLY=1 to mutate rows in place (update_columns, bypassing
    the read-only guard) and delete rows whose new share is 0.

    Per ship the existing total is preserved EXACTLY and re-split among the same recipients by
    their attributed seconds this cycle; the owner absorbs the rounding remainder. Aggregate per
    ship never changes — only the per-member distribution moves.

    Filters:
      SINCE=YYYY-MM-DD       Only ships approved on/after this date
      EXCLUDE_SHIP_IDS=1,2   Skip these ship ids (comma-separated)

    Examples:
      bin/rake koi:backfill_per_entry_split
      bin/rake koi:backfill_per_entry_split APPLY=1
      bin/rake koi:backfill_per_entry_split CURRENCY=gold
      bin/rake koi:backfill_per_entry_split CURRENCY=gold APPLY=1
  DESC
  task backfill_per_entry_split: :environment do
    apply = ENV["APPLY"] == "1"
    currency = (ENV["CURRENCY"].presence || "koi").downcase
    raise "CURRENCY must be koi or gold" unless %w[koi gold].include?(currency)
    gold = currency == "gold"
    model = gold ? GoldTransaction : KoiTransaction
    awarder = gold ? ShipGoldAwarder : ShipKoiAwarder
    since = ENV["SINCE"].presence && Date.parse(ENV["SINCE"])
    exclude_ids = (ENV["EXCLUDE_SHIP_IDS"] || "").split(",").filter_map { |s| Integer(s, exception: false) }

    ship_ids = model.where(reason: "ship_review").where.not(ship_id: nil).distinct.pluck(:ship_id)
    ships = Ship.where(id: ship_ids)
    ships = ships.where("ships.updated_at >= ?", since.beginning_of_day) if since
    ships = ships.where.not(id: exclude_ids) if exclude_ids.any?
    ships = ships.includes(:design_review, :build_review, project: :user)

    updates = [] # { row:, ship_id:, name:, old:, new:, desc: }
    deletes = [] # { row:, ship_id:, name:, old: }
    deltas  = Hash.new(0) # user_id => net change across all ships
    users   = {}          # user_id => User (for resulting-balance lookup)

    ships.find_each do |ship|
      rows = model.where(reason: "ship_review", ship_id: ship.id).includes(:user).to_a
      next if rows.empty?
      recipients = rows.map(&:user)
      recipients.each { |u| users[u.id] = u }
      # Preserve the exact amount already awarded for this ship; only redistribute it.
      existing_total = rows.sum(&:amount)
      weights = ShipKoiAwarder.member_weights(ship, recipients)
      shares  = ShipKoiAwarder.compute_shares(existing_total, recipients, ship.project.user_id, weights)

      rows.each do |row|
        new_amt = shares[row.user_id].to_i
        next if new_amt == row.amount
        deltas[row.user_id] += new_amt - row.amount
        if new_amt.zero?
          deletes << { row: row, ship_id: ship.id, name: row.user.display_name, old: row.amount }
        else
          desc = awarder.build_description(ship, new_amt, existing_total, recipients.size)
          updates << { row: row, ship_id: ship.id, name: row.user.display_name, old: row.amount, new: new_amt, desc: desc }
        end
      end
    end

    # Resulting balance = current balance (already reflects the OLD rows) + net delta.
    negatives = deltas.filter_map do |uid, delta|
      next if delta.zero?
      bal = gold ? users[uid].gold : users[uid].koi
      resulting = bal + delta
      next if resulting >= 0
      { user_id: uid, name: users[uid].display_name, current: bal, delta: delta, resulting: resulting }
    end.sort_by { |h| h[:resulting] }

    mode = apply ? "APPLY" : "DRY RUN"
    puts "ship_review #{currency} per-entry redistribution — #{mode}"
    puts "=" * 60
    puts "Ships with ship_review #{currency}:  #{ships.count}"
    puts "Rows to update (amount moves): #{updates.size}"
    puts "Rows to delete (new share 0): #{deletes.size}"
    puts "Users affected:               #{deltas.count { |_, d| d != 0 }}"
    puts "Net #{currency} moved (Σ|delta|/2): #{deltas.values.sum(&:abs) / 2}"
    puts ""

    if negatives.any?
      puts "⚠️  #{negatives.size} USER(S) WOULD GO NEGATIVE — FLAGGED:"
      negatives.each do |n|
        puts "  user_id=#{n[:user_id]}  #{n[:name].inspect}  current=#{n[:current]}  delta=#{n[:delta]}  resulting=#{n[:resulting]}"
      end
    else
      puts "✓ No user goes negative."
    end
    puts ""

    puts "Updates (first 50):"
    updates.first(50).each { |u| puts "  ship=#{u[:ship_id]}  #{u[:name].inspect}  #{u[:old]} → #{u[:new]}" }
    puts "  …(#{updates.size - 50} more)" if updates.size > 50
    puts ""
    puts "Deletes (first 50):"
    deletes.first(50).each { |d| puts "  ship=#{d[:ship_id]}  #{d[:name].inspect}  #{d[:old]} → 0 (row removed)" }
    puts "  …(#{deletes.size - 50} more)" if deletes.size > 50
    puts ""

    unless apply
      puts "Dry run only — nothing mutated. Re-run with APPLY=1 to commit."
      next
    end

    puts "APPLYING — mutating #{model.table_name}..."
    ActiveRecord::Base.transaction do
      updates.each { |u| u[:row].update_columns(amount: u[:new], description: u[:desc]) } # update_columns bypasses the read-only guard
      deletes.each { |d| d[:row].delete } # delete bypasses the read-only before_destroy guard (new share is 0, which the amount validation forbids)
    end
    puts "Done. Updated #{updates.size}, deleted #{deletes.size}."
  end
end
