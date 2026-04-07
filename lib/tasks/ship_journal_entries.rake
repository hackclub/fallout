# frozen_string_literal: true

namespace :ships do
  desc "Backfill journal_entries.ship_id for existing approved ships"
  task backfill_journal_entries: :environment do
    ships = Ship.approved.includes(:project).order(:created_at)
    puts "Found #{ships.count} approved ships to backfill"

    ships.find_each do |ship|
      entries = ship.new_journal_entries.where(ship_id: nil)
      count = entries.update_all(ship_id: ship.id)
      puts "  Ship ##{ship.id} (#{ship.project.name}): #{count} entries assigned" if count > 0
    end

    puts "Done"
  end
end
