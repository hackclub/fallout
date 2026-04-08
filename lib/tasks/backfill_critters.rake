desc "Backfill critters for journal entries missing one for their owner or collaborators"
task backfill_critters: :environment do
  entries = JournalEntry.kept.includes(:critters, :collaborator_users)
  total = entries.size
  created = 0

  puts "Scanning #{total} journal entries..."

  entries.find_each do |je|
    # Collect all users who should have a critter: owner + collaborators
    eligible_users = [ je.user ].concat(je.collaborator_users.to_a)
      .select(&:can_earn_critter?)

    eligible_users.each do |user|
      next if je.critters.any? { |c| c.user_id == user.id }

      Critter.create!(
        user: user,
        journal_entry: je,
        variant: Critter::VARIANTS.sample
      )
      created += 1
    end
  end

  puts "Done. Created #{created} critters across #{total} journal entries."
end
