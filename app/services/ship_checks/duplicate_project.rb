module ShipChecks
  module DuplicateProject
    DEFINITION = { key: :duplicate_project, label: "Not a duplicate of another submission", deps: [], visibility: :internal }.freeze

    def self.call(ctx)
      project = ctx.project
      candidates = ProjectDuplicates.fallout_candidates(project) +
                   ProjectDuplicates.stasis_candidates(project)
      match = ProjectDuplicates.find_duplicate(project, candidates)

      if match
        ShipCheckService::CheckResult.new(
          key: "duplicate_project", label: DEFINITION[:label],
          status: :warn,
          message: "Matches #{match[:program].titleize} project (#{match[:external_id]})",
          visibility: :internal
        )
      else
        ShipCheckService::CheckResult.new(
          key: "duplicate_project", label: DEFINITION[:label],
          status: :passed, message: nil, visibility: :internal
        )
      end
    rescue StandardError => e
      ErrorReporter.capture_exception(e, contexts: { duplicate_project: { project_id: project&.id } })
      ShipCheckService::CheckResult.new(
        key: "duplicate_project", label: DEFINITION[:label],
        status: :skipped, message: "Duplicate lookup unavailable", visibility: :internal
      )
    end
  end
end
