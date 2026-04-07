# frozen_string_literal: true

namespace :preflight do
  desc "Backfill preflight_results for ships that have nil results"
  task backfill: :environment do
    ships = Ship.where(preflight_results: nil).includes(:project)

    puts "Found #{ships.count} ships to backfill"

    ships.find_each do |ship|
      project = ship.project
      print "  Ship ##{ship.id} (#{project.name})... "

      begin
        results = ShipCheckService.run_all(project, run_all_checks: true, force: true)
        snapshot = results.map(&:as_json)
        ship.update_columns(preflight_results: snapshot)
        puts "done (#{results.count} checks)"
      rescue => e
        puts "FAILED: #{e.message}"
      end
    end

    puts "Done"
  end
end
