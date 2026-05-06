namespace :meilisearch do
  desc "Reindex all searchable models into Meilisearch (Project + JournalEntry)"
  task reindex: :environment do
    Project.ms_reindex!
    JournalEntry.ms_reindex!
  end
end
