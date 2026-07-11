namespace :debt do
  desc "(Re)build the frozen as-of-cutoff approved-hours snapshot the debt console judges debt against. " \
       "Optional arg: cutoff timestamp (default July 1, 2026 Pacific)."
  task :snapshot, [ :cutoff ] => :environment do |_t, args|
    cutoff = args[:cutoff].present? ? Time.zone.parse(args[:cutoff]) : DebtSnapshot::CUTOFF
    puts "Building debt snapshot as of #{cutoff}..."
    count = DebtSnapshotBuilder.rebuild!(cutoff)
    puts "Done. #{count} ticket-holder(s) snapshotted."
  end
end
