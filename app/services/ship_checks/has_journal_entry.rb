# frozen_string_literal: true

module ShipChecks
  module HasJournalEntry
    DEFINITION = { key: :has_journal_entry, label: "Has journaled", deps: [], visibility: :user }.freeze

    def self.call(ctx)
      project = ctx.project
      has_entries = project.kept_journal_entries.size > 0

      if project.tags.include?("burnout")
        status = has_entries ? :passed : :failed
        message = has_entries ? nil : "Add at least one journal entry"
      else
        passed = has_entries && project.time_logged.to_i > 300
        status = passed ? :passed : :failed
        message = passed ? nil : "Journal your progress with time-lapse recordings"
      end

      ShipCheckService::CheckResult.new(
        key: "has_journal_entry", label: DEFINITION[:label],
        status: status, message: message, visibility: :user
      )
    end
  end
end
