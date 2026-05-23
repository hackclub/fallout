namespace :meilisearch do
  # Pauses the `default` Solid Queue while running so concurrent MeilisearchReindexJob
  # enqueues from after_commit callbacks don't fight the bulk reindex for Meilisearch
  # resources. Pending MeilisearchReindexJob ready/failed executions are cleared first
  # — the bulk reindex makes them redundant. Live enqueues that arrive while paused
  # also get cleared at the end (same reasoning) before the queue is unpaused.
  desc "Reindex all searchable models into Meilisearch (Project + JournalEntry + User)"
  task reindex: :environment do
    queue = "meilisearch"
    paused = SolidQueue::Pause.find_or_create_by!(queue_name: queue)
    puts "Paused #{queue} queue."

    begin
      clear_redundant_meilisearch_jobs!

      [ Project, JournalEntry, User ].each_with_index do |model, i|
        sleep 5 if i.positive? # let Meilisearch settle between models so memory spikes don't overlap
        puts "Reindexing #{model.name} (#{model.count} records)…"
        model.ms_reindex!
        puts "  done."
      end

      clear_redundant_meilisearch_jobs!
    ensure
      paused.destroy
      puts "Unpaused #{queue} queue."
    end
  end

  def clear_redundant_meilisearch_jobs!
    job_scope = SolidQueue::Job.where(class_name: "MeilisearchReindexJob")
    ready = SolidQueue::ReadyExecution.where(job: job_scope).delete_all
    failed = SolidQueue::FailedExecution.where(job: job_scope).delete_all
    puts "Cleared #{ready} ready + #{failed} failed MeilisearchReindexJob executions."
  end
end
