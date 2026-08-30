# frozen_string_literal: true

# READ-ONLY estimate of how long a reviewer actually spent reviewing.
#
# Nothing stores a review's start time — claims are written with update_all/update_columns,
# so PaperTrail never sees them. What we do have: ApplicationController#track_page_view logs
# an Ahoy "$view" event (controller + action) for every request, and an open review page
# beats every 2 minutes to hold its claim (useReviewHeartbeat). That stream is a usable
# time-on-task log.
#
# Each terminal review is anchored at `completed_at` and walked BACKWARDS through the
# reviewer's events for that queue until the `show` that opened the page (or a gap larger
# than GAP). Consequences of anchoring on completed_at:
#   - pages opened, skimmed and skipped never count — only sessions ending in a submission
#   - each session is capped at CAP minutes, so a tab left open over lunch can't inflate it
#   - a session can never start before the previous counted review finished (no double count)
# Reviews with no usable event trail (pre-Ahoy, submitted from a resumed tab, dev) land in
# the "unattributed" bucket and are reported separately, then imputed at the median.
#
# Writes NOTHING.
namespace :reviewers do
  desc "Estimate reviewer time-on-task from Ahoy heartbeats (read-only). REVIEWER=3226 [QUEUE=rc CAP=30 GAP=5 SINCE=2026-06-01 DETAIL=1]"
  task hours: :environment do
    queues = {
      "rc" => { model: "RequirementsCheckReview", controller: "admin/reviews/requirements_checks", label: "Requirements Check" },
      "dr" => { model: "DesignReview",            controller: "admin/reviews/design_reviews",      label: "Design Review" },
      "br" => { model: "BuildReview",             controller: "admin/reviews/build_reviews",       label: "Build Review" },
      "ta" => { model: "TimeAuditReview",         controller: "admin/reviews/time_audits",         label: "Time Audit" }
    }

    reviewer_id = ENV["REVIEWER"].to_i
    abort "REVIEWER=<user id> is required" if reviewer_id.zero?

    queue = queues[(ENV["QUEUE"] || "rc").downcase]
    abort "QUEUE must be one of: #{queues.keys.join(', ')}" if queue.nil?

    cap = (ENV["CAP"] || 30).to_f * 60
    gap = (ENV["GAP"] || 5).to_f * 60
    since = ENV["SINCE"].present? ? Time.zone.parse(ENV["SINCE"]) : nil

    reviewer = User.find(reviewer_id)
    model = queue[:model].constantize

    reviews = model.where(status: %w[approved returned rejected], reviewer_id: reviewer.id)
      .where.not(completed_at: nil)
    reviews = reviews.where("completed_at >= ?", since) if since
    reviews = reviews.order(:completed_at).pluck(:id, :completed_at)

    events = Ahoy::Event.where(user_id: reviewer.id, name: "$view")
      .where("properties->>'controller' = ?", queue[:controller])
    events = events.where("time >= ?", since - 1.day) if since
    events = events.order(:time).pluck(:time, Arel.sql("properties->>'action'"))

    times = events.map(&:first)

    rows = []
    unattributed = []
    floor = nil # a session can't start before the previous counted review finished

    reviews.each do |id, completed_at|
      # Index of the last event at or before this review's submission.
      after = (0...times.size).bsearch { |i| times[i] > completed_at }
      idx = (after || times.size) - 1

      if idx.negative? || completed_at - times[idx] > gap
        unattributed << id
        next
      end

      start = times[idx]
      while idx.positive? && events[idx][1] != "show" && start - times[idx - 1] <= gap
        idx -= 1
        start = times[idx]
      end

      start = [ start, floor ].max if floor
      seconds = [ completed_at - start, 0 ].max
      floor = completed_at

      rows << { id: id, completed_at: completed_at, seconds: [ seconds, cap ].min, capped: seconds > cap }
    end

    minutes = rows.map { |r| r[:seconds] / 60 }.sort
    pct = lambda do |n|
      return 0.0 if minutes.empty?
      rank = (n / 100.0) * (minutes.size - 1)
      lo = minutes[rank.floor]
      lo + (minutes[rank.ceil] - lo) * (rank - rank.floor)
    end

    median = pct.call(50)
    counted_hours = minutes.sum / 60
    imputed_hours = counted_hours + (unattributed.size * median / 60)

    if ENV["DETAIL"] == "1"
      puts "review|completed_at|minutes|capped"
      rows.each { |r| puts "#{queue[:model]}##{r[:id]}|#{r[:completed_at].iso8601}|#{(r[:seconds] / 60).round(1)}|#{r[:capped]}" }
      puts
    end

    puts "== #{reviewer.display_name} (##{reviewer.id}) — #{queue[:label]} =="
    puts "window: #{since ? since.to_date : 'all time'} → today (cap #{(cap / 60).round}m/review, gap #{(gap / 60).round}m)"
    puts "completed reviews: #{reviews.size} (#{rows.size} with a session trail, #{unattributed.size} unattributed)"
    puts "sessions hitting the cap: #{rows.count { |r| r[:capped] }}"
    puts "median: #{median.round(1)}m | mean: #{minutes.any? ? (minutes.sum / minutes.size).round(1) : 0}m | p25: #{pct.call(25).round(1)}m | p75: #{pct.call(75).round(1)}m | p90: #{pct.call(90).round(1)}m"
    puts "counted hours: #{counted_hours.round(1)}"
    puts "with unattributed reviews imputed at the median: #{imputed_hours.round(1)}"
  end
end
