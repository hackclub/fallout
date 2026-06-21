# frozen_string_literal: true

module ShipChecks
  module BomExists
    DEFINITION = { key: :bom_exists, label: "Bill of Materials in repository", deps: [ :repo_tree ], visibility: :user }.freeze

    def self.call(ctx)
      tree = ctx.repo_tree
      if tree.nil?
        msg = ctx.non_github_repo? ? "Skipped (non-GitHub repository)" : "Repository not accessible"
        return ShipCheckService::CheckResult.new(
          key: "bom_exists", label: DEFINITION[:label],
          status: :skipped, message: msg, visibility: :user
        )
      end

      found = tree.any? do |path|
        name = File.basename(path).downcase
        name.end_with?(".csv", ".xlsx") && name.match?(/bom|bill.of.material/)
      end

      ShipCheckService::CheckResult.new(
        key: "bom_exists",
        label: DEFINITION[:label],
        status: found ? :passed : :warn,
        message: found ? nil : "We couldn't find a Bill of Materials (BOM.csv) in your repository. You need one!",
        visibility: :user
      )
    end
  end
end
