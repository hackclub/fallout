# frozen_string_literal: true

module ShipCheckService
  STATUSES = %i[passed failed warn skipped].freeze
  MAX_THREADS = 4
  GITHUB_TIMEOUT = 8
  CACHE_TTL = 12.hours

  CheckResult = Data.define(:key, :label, :status, :message, :visibility) do
    def passed? = status == :passed
    def failed? = status == :failed
    def blocking? = status == :failed # Only hard failures block submission
    def user? = visibility == :user
    def internal? = visibility == :internal

    def as_json(*)
      { key:, label:, status: status.to_s, message:, visibility: visibility.to_s }
    end
  end

  # Lightweight stand-in for Project used by the admin test harness.
  # Responds to the same interface checks call, backed by plain values.
  TestProject = Struct.new(:description, :repo_link, :journal_entries_count, :time_logged, keyword_init: true) do
    def kept_journal_entries
      Array.new(journal_entries_count.to_i, true)
    end
  end

  # Ordered list of check modules — each must implement .call(ctx) and DEFINITION.
  # Single-result checks return one CheckResult; batched checks return an array.
  USER_CHECK_MODULES = [
    ShipChecks::HasDescription,
    ShipChecks::HasRepoLink,
    ShipChecks::HasJournalEntry,
    ShipChecks::RepoIsPublic,
    ShipChecks::ReadmeExists,
    ShipChecks::BomExists,
    ShipChecks::HasPcbFiles,
    ShipChecks::HasCadFiles,
    ShipChecks::HasFirmware,
    ShipChecks::BomFormatting,
    ShipChecks::HasZinePage,
    ShipChecks::ReadmeHasImages,
    ShipChecks::ReadmeHasHeadings,
    ShipChecks::ReadmeQuality,
    ShipChecks::RepoOrganization,
    ShipChecks::ImagesShowHardware
  ].freeze

  # Internal checks — plagiarism/AI detection, only visible to admins
  INTERNAL_CHECK_MODULES = [
    ShipChecks::AiGeneratedImage,
    ShipChecks::ImageOriginality,
    ShipChecks::CodePlagiarism,
    ShipChecks::DuplicateProject
  ].freeze

  CHECKS = (USER_CHECK_MODULES + INTERNAL_CHECK_MODULES).freeze

  # Collect all DEFINITION(S) — batched modules use DEFINITIONS (plural)
  DEFINITIONS = CHECKS.flat_map { |c| defined?(c::DEFINITIONS) ? c::DEFINITIONS : [ c::DEFINITION ] }.freeze
  USER_CHECKS = DEFINITIONS.select { |d| d[:visibility] == :user }.freeze
  INTERNAL_CHECKS = DEFINITIONS.select { |d| d[:visibility] == :internal }.freeze

  # Fetcher resolution order — each unlocks checks whose deps are now satisfied
  FETCHER_ORDER = %i[repo_meta repo_tree readme_content bom_content image_descriptions].freeze

  module_function

  # Runs all checks, pipelined: checks start as soon as their deps resolve.
  # Yields each CheckResult as it completes (for real-time cache updates).
  # Results are cached by repo state + project fields; pass force: true to bypass.
  def run_all(project, run_all_checks: false, force: false, return_context: false, &on_complete)
    ctx = ShipChecks::SharedContext.new(project)

    # Resolve repo_meta first (needed for cache key)
    ctx.repo_meta

    # Return cached results if repo + project state unchanged
    unless force
      cached = load_cached_results(ctx, project)
      if cached
        cached.each { |r| on_complete&.call(r) }
        return return_context ? [ cached, ctx ] : cached
      end
    end

    pool = Queue.new
    MAX_THREADS.times { pool << true }
    mutex = Mutex.new
    results = []
    check_threads = []

    # Determine which modules to pipeline
    user_mods = USER_CHECK_MODULES.dup
    mod_deps = build_mod_deps(user_mods)
    resolved = Set.new

    # Launch no-dep checks immediately (e.g. has_description)
    launch_ready!(user_mods, mod_deps, resolved, ctx, pool, mutex, results, check_threads, &on_complete)

    # Resolve fetchers in order, launching eligible checks after each
    needed = DEFINITIONS.flat_map { |d| d[:deps] }.uniq
    FETCHER_ORDER.each do |dep|
      next unless needed.include?(dep)
      ctx.send(dep)
      resolved << dep
      launch_ready!(user_mods, mod_deps, resolved, ctx, pool, mutex, results, check_threads, &on_complete)
    end

    check_threads.each(&:join)

    # Phase 2: internal checks (skip if user checks block, unless testing)
    user_blocked = results.select(&:user?).any?(&:blocking?)
    if user_blocked && !run_all_checks
      internal_results = skip_internal_checks
      internal_results.each { |r| on_complete&.call(r) }
      results.concat(internal_results)
    else
      int_mods = INTERNAL_CHECK_MODULES.dup
      int_deps = build_mod_deps(int_mods)
      int_threads = []
      launch_ready!(int_mods, int_deps, resolved, ctx, pool, mutex, results, int_threads, &on_complete)
      int_threads.each(&:join)
    end

    # Return results in DEFINITIONS order
    order = DEFINITIONS.map { |d| d[:key].to_s }
    sorted = results.sort_by { |r| order.index(r.key) || order.size }

    store_cached_results(ctx, project, sorted)
    return_context ? [ sorted, ctx ] : sorted
  end

  # Only user-visible, blocking failures prevent submission (warn/skipped are non-blocking)
  def all_passed?(project)
    run_all(project).select(&:user?).none?(&:blocking?)
  end

  # Build a hash of module → Set of required fetcher deps
  def build_mod_deps(modules)
    modules.each_with_object({}) do |mod, h|
      defs = defined?(mod::DEFINITIONS) ? mod::DEFINITIONS : [ mod::DEFINITION ]
      h[mod] = defs.flat_map { |d| d[:deps] }.uniq.to_set
    end
  end

  # Launch checks from pending whose deps are all resolved, removing them from pending
  def launch_ready!(pending, mod_deps, resolved, ctx, pool, mutex, results, threads, &on_complete)
    ready = pending.select { |mod| mod_deps[mod].subset?(resolved) }
    pending.reject! { |mod| ready.include?(mod) }

    ready.each do |check_mod|
      pool.pop
      threads << Thread.new do
        result = check_mod.call(ctx)
        mutex.synchronize do
          Array(result).each do |r|
            results << r
            on_complete&.call(r)
          end
        end
      ensure
        pool << true
      end
    end
  end

  # Mark all internal checks as skipped (user checks failed, no point spending on LLM/API calls)
  def skip_internal_checks
    INTERNAL_CHECKS.map do |d|
      CheckResult.new(
        key: d[:key].to_s, label: d[:label],
        status: :skipped, message: "Skipped (user checks failed)", visibility: :internal
      )
    end
  end

  # Keyed on the HEAD commit SHA so any push busts the cache. Returns nil when the SHA
  # can't be resolved (missing repo_meta, rate limit, error) — callers must skip the cache
  # rather than fall back to a constant key, which would serve stale results across pushes.
  def cache_key(ctx, project)
    sha = ctx.head_sha
    return nil unless sha
    nwo = ctx.repo_meta&.dig("full_name") || "none"
    fields = Digest::MD5.hexdigest([
      project.description.to_s,
      project.repo_link.to_s,
      project.respond_to?(:kept_journal_entries) ? project.kept_journal_entries.size : 0,
      project.respond_to?(:time_logged) ? project.time_logged.to_i : 0,
      project.respond_to?(:tags) ? project.tags.sort.join(",") : ""
    ].join("|"))
    "ship_check_results:#{nwo}:#{sha}:#{fields}"
  end

  def load_cached_results(ctx, project)
    key = cache_key(ctx, project)
    return nil unless key
    data = Rails.cache.read(key)
    return nil unless data

    data.map do |r|
      CheckResult.new(
        key: r[:key], label: r[:label],
        status: r[:status].to_sym, message: r[:message],
        visibility: r[:visibility].to_sym
      )
    end
  end

  def store_cached_results(ctx, project, results)
    key = cache_key(ctx, project)
    return unless key # Don't cache when the commit can't be pinned — avoids stale results across pushes
    Rails.cache.write(key, results.map(&:as_json), expires_in: CACHE_TTL)
  end
end
