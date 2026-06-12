namespace :lapse do
  desc "Backfill LapseTimelapse durations with actual video duration (via ffprobe)"
  task backfill_video_durations: :environment do
    total = LapseTimelapse.count
    updated = 0
    skipped = 0
    failed = 0

    LapseTimelapse.find_each.with_index do |lt, i|
      print "\r[#{i + 1}/#{total}] #{lt.name || lt.lapse_timelapse_id}..."

      unless lt.playback_url.present?
        skipped += 1
        next
      end

      output = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 #{Shellwords.escape(lt.playback_url)} 2>&1`.strip
      video_duration = output.to_f

      if video_duration > 0
        real_duration = video_duration * 60 # 1 video second = 1 real minute
        old_duration = lt.duration
        lt.update!(duration: real_duration)
        updated += 1
        puts "\n  #{lt.name}: #{old_duration}s → #{real_duration}s (video: #{video_duration.round(1)}s)"
      else
        failed += 1
        puts "\n  Failed #{lt.name}: ffprobe returned '#{output}'"
      end
    rescue => e
      failed += 1
      puts "\n  Failed LapseTimelapse ##{lt.id}: #{e.message}"
    end

    puts "\nDone. Updated: #{updated}, Skipped: #{skipped}, Failed: #{failed}"
  end

  desc "Archive all LapseTimelapses (footage + metadata) to R2. FORCE=1 re-archives, INLINE=1 runs synchronously, LIMIT=n caps the batch, DRY_RUN=1 projects without writing"
  task archive_all: :environment do
    force = ENV["FORCE"] == "1"
    inline = ENV["INLINE"] == "1"
    limit = ENV["LIMIT"].presence&.to_i
    dry_run = ENV["DRY_RUN"] == "1"

    scope = force ? LapseTimelapse.all : LapseTimelapse.where(archived_at: nil)
    scope = scope.limit(limit) if limit
    total = scope.count

    # find_each ignores limit/order, so iterate the limited result set directly when capped.
    each_row = limit ? scope.each : scope.find_each

    if dry_run
      # No API calls, downloads, uploads, or DB writes — projects outcome from cached state.
      # archive! archives footage when a playback_url resolves (fresh||cached), else metadata-only.
      with_footage = 0
      meta_only = []
      each_row.each do |lt|
        if lt.playback_url.present?
          with_footage += 1
        else
          meta_only << lt
        end
      end
      puts "DRY RUN — no writes. Candidates: #{total} (#{force ? 'all rows' : 'unarchived only'}#{limit ? ", LIMIT #{limit}" : ''})"
      puts "  would archive WITH footage:     #{with_footage}"
      puts "  would archive METADATA-ONLY:    #{meta_only.size} (no cached playback_url)"
      meta_only.first(15).each { |lt| puts "    ##{lt.id} #{lt.lapse_timelapse_id} vis=#{lt.visibility} dur=#{lt.duration.to_i}s" }
      puts "    …and #{meta_only.size - 15} more" if meta_only.size > 15
      next
    end

    unless inline
      each_row.each { |lt| ArchiveLapseTimelapseJob.perform_later(lt.id, force: force) }
      puts "Enqueued #{total} archive job(s) on the :heavy queue."
      next
    end

    concurrency = (ENV["CONCURRENCY"].presence || "1").to_i.clamp(1, 24)
    pool_size = ActiveRecord::Base.connection_pool.size
    abort "CONCURRENCY=#{concurrency} exceeds DB pool (#{pool_size}); lower it or raise RAILS_MAX_THREADS" if concurrency > pool_size

    archived = 0
    metadata_only = [] # { id:, lapse_id:, note: } — no footage on Lapse; metadata.json still captured
    failures = []      # { id:, lapse_id:, error: } — real errors (flagged + logged below)
    done = 0
    mutex = Mutex.new

    # Work-stealing pool: each worker pops the next id the instant it finishes its current
    # one (no per-batch barrier), so uneven per-video times don't stall the others.
    queue = Thread::Queue.new
    scope.pluck(:id).each { |id| queue << id }
    queue.close
    puts "Archiving #{total} timelapse(s) with #{concurrency} worker(s)…"

    workers = Array.new(concurrency) do |w|
      tag = "w#{w + 1}"
      Thread.new do
        svc = LapseArchiveService.new # per-thread instance → its own R2 client (Aws clients are thread-safe, but keep it isolated)
        while (id = queue.pop)
          ActiveRecord::Base.connection_pool.with_connection do
            lt = LapseTimelapse.find(id)
            started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
            # Print BEFORE the slow work so a stall shows the last "▶" line for the stuck worker.
            mutex.synchronize { puts "[#{tag}] ▶ #{lt.lapse_timelapse_id}…" }
            begin
              result = svc.archive!(lt, force: force)
              if result == :archived_metadata_only
                rec = Recording.find_by(recordable_type: "LapseTimelapse", recordable_id: lt.id)
                note = "vis=#{lt.visibility} dur=#{lt.duration.to_i}s#{rec ? " journal=##{rec.journal_entry_id}" : ' (unattached)'}"
              end
              secs = (Process.clock_gettime(Process::CLOCK_MONOTONIC) - started).round(1)
              mutex.synchronize do
                done += 1
                case result
                when :archived
                  archived += 1
                  puts "[#{tag}][#{done}/#{total}] ✓ #{lt.lapse_timelapse_id} (#{secs}s | #{svc.timing_summary})"
                when :archived_metadata_only
                  metadata_only << { id: lt.id, lapse_id: lt.lapse_timelapse_id, note: note }
                  puts "[#{tag}][#{done}/#{total}] ⚠️  metadata-only #{lt.lapse_timelapse_id} (#{note})"
                end
              end
            rescue StandardError => e
              secs = (Process.clock_gettime(Process::CLOCK_MONOTONIC) - started).round(1)
              mutex.synchronize do
                done += 1
                failures << { id: lt.id, lapse_id: lt.lapse_timelapse_id, error: "#{e.class}: #{e.message}" }
                puts "[#{tag}][#{done}/#{total}] ❌ FAILED #{lt.lapse_timelapse_id} (#{secs}s): #{e.class}: #{e.message}"
                Rails.logger.error("[lapse:archive_all] FAILED ##{lt.id} (#{lt.lapse_timelapse_id}): #{e.class}: #{e.message}")
              end
            end
          end
        end
      end
    end
    workers.each(&:join)

    puts "\nDone. Archived w/ footage: #{archived}, Metadata-only (no footage): #{metadata_only.size}, Failed: #{failures.size} (of #{total})."

    write_report = lambda do |rows, label, filename|
      next if rows.empty?

      path = Rails.root.join("log", filename)
      File.open(path, "a") do |f|
        f.puts "# lapse:archive_all run @ #{Time.current.iso8601} — #{rows.size} #{label}"
        rows.each { |r| f.puts "##{r[:id]}\t#{r[:lapse_id]}\t#{r[:note] || r[:error]}" }
      end
      puts "\n#{label.capitalize} (also written to #{path}):"
      rows.each { |r| puts "  ##{r[:id]} #{r[:lapse_id]} — #{r[:note] || r[:error]}" }
    end

    write_report.call(metadata_only, "metadata-only (no-footage) timelapse(s)", "lapse_archive_no_footage.log")
    write_report.call(failures, "failure(s)", "lapse_archive_failures.log")
  end

  desc "Verify Lapse R2 archives (metadata + object existence + sizes; DEEP=1 re-downloads to checksum). CONCURRENCY=n, LIMIT=n"
  task verify_archives: :environment do
    deep = ENV["DEEP"] == "1"
    limit = ENV["LIMIT"].presence&.to_i
    concurrency = (ENV["CONCURRENCY"].presence || "1").to_i.clamp(1, 24)

    scope = LapseTimelapse.where.not(archived_at: nil)
    scope = scope.limit(limit) if limit
    total = scope.count
    abort "CONCURRENCY=#{concurrency} exceeds DB pool" if concurrency > ActiveRecord::Base.connection_pool.size

    ok = 0
    problems = [] # { id:, lapse_id:, issues: [...] }
    done = 0
    mutex = Mutex.new
    queue = Thread::Queue.new
    scope.pluck(:id).each { |id| queue << id }
    queue.close
    puts "Verifying #{total} archive(s) with #{concurrency} worker(s)#{deep ? ' [DEEP]' : ''}…"

    workers = Array.new(concurrency) do |w|
      tag = "w#{w + 1}"
      Thread.new do
        svc = LapseArchiveService.new
        while (id = queue.pop)
          ActiveRecord::Base.connection_pool.with_connection do
            lt = LapseTimelapse.find(id)
            issues =
              begin
                svc.verify(lt, deep: deep)
              rescue StandardError => e
                [ "#{e.class}: #{e.message}" ]
              end
            mutex.synchronize do
              done += 1
              if issues.empty?
                ok += 1
                puts "[#{tag}][#{done}/#{total}] ✓ #{lt.lapse_timelapse_id}"
              else
                problems << { id: lt.id, lapse_id: lt.lapse_timelapse_id, issues: issues }
                puts "[#{tag}][#{done}/#{total}] ❌ #{lt.lapse_timelapse_id}: #{issues.join('; ')}"
                Rails.logger.error("[lapse:verify_archives] ##{lt.id} (#{lt.lapse_timelapse_id}): #{issues.join('; ')}")
              end
            end
          end
        end
      end
    end
    workers.each(&:join)

    puts "\nDone. OK: #{ok}, Problems: #{problems.size} (of #{total})."
    if problems.any?
      path = Rails.root.join("log", "lapse_archive_verify_problems.log")
      File.open(path, "a") do |f|
        f.puts "# lapse:verify_archives run @ #{Time.current.iso8601} — #{problems.size} problem(s)"
        problems.each { |p| f.puts "##{p[:id]}\t#{p[:lapse_id]}\t#{p[:issues].join(' | ')}" }
      end
      puts "Problems also written to #{path}"
    end
  end
end
