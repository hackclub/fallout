module AdminPerfStats
  module_function

  # Composes the single-line stats string shown in the admin perf badge.
  # Called both from the layout (initial render) and from the X-Perf-Stats response header
  # (Inertia visits update via axios interceptor in inertia.ts).
  def compose
    [ db_segment, cache_segment, rps_segment, active_segment ].compact.join("  ")
  end

  def compose_long
    [ build_segment, db_segment_long, cache_segment_long, rps_segment_long, active_segment_long ].compact.join(" ")
  end

  def build_segment
    return nil unless Rails.application.config.respond_to?(:git_version)
    age = ApplicationController.helpers.time_ago_in_words(Rails.application.config.server_start_time)
    "Build #{Rails.application.config.git_version} from #{age} ago."
  end

  def db_segment_long
    return nil unless defined?(QueryCount::Counter)
    "(DB: #{QueryCount::Counter.counter} queries, #{QueryCount::Counter.counter_cache} cached)"
  end

  def cache_segment_long
    "(CACHE: #{Thread.current[:cache_hits].to_i} hits, #{Thread.current[:cache_misses].to_i} misses)"
  end

  def rps_segment_long
    rps = RequestCounter.per_second
    rps == :high_load ? "(lots of req/sec)" : "(#{rps} req/sec)"
  rescue StandardError
    nil
  end

  def active_segment_long
    counts = ActiveUserTracker.counts
    "(Active: #{counts[:signed_in]} signed in, #{counts[:anonymous]} visitors)"
  rescue StandardError
    nil
  end

  def db_segment
    return nil unless defined?(QueryCount::Counter)
    "DB: #{QueryCount::Counter.counter}q #{QueryCount::Counter.counter_cache}c"
  end

  def cache_segment
    "C: #{Thread.current[:cache_hits].to_i}y #{Thread.current[:cache_misses].to_i}n"
  end

  def rps_segment
    rps = RequestCounter.per_second
    rps == :high_load ? "lots r/s" : "#{rps}r/s"
  rescue StandardError
    nil
  end

  def active_segment
    counts = ActiveUserTracker.counts
    "A: #{counts[:signed_in]}, #{counts[:anonymous]}"
  rescue StandardError
    nil
  end
end
