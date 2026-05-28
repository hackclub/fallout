# frozen_string_literal: true

module ShipChecks
  module HasCadFiles
    DEFINITION = { key: :has_cad_files, label: "3D model files in repository", deps: [ :repo_tree, :readme_content ], visibility: :user }.freeze

    def self.call(ctx)
      tree = ctx.repo_tree
      if tree.nil?
        msg = ctx.non_github_repo? ? "Skipped (non-GitHub repository)" : "Repository not accessible"
        return ShipCheckService::CheckResult.new(
          key: "has_cad_files", label: DEFINITION[:label],
          status: :skipped, message: msg, visibility: :user
        )
      end

      extensions = tree.map { |p| File.extname(p).downcase }
      has_model = %w[.stl .obj .3mf .stp .step].any? { |ext| extensions.include?(ext) }
      has_source = %w[.f3d .f3z .fcstd .sldprt].any? { |ext| extensions.include?(ext) }
      has_onshape = onshape_link_in_docs?(ctx)
      passed = has_model && (has_source || has_onshape)
      message = if passed
        nil
      elsif has_model
        "Add CAD source files (.f3d, .f3z, .FCStd, .sldprt, or Onshape link) alongside your 3D exports"
      elsif has_source || has_onshape
        "Add exported 3D model files (.step) alongside your CAD source"
      else
        "Add 3D model exports (.step) and CAD source (.f3d, .f3z, .FCStd, .sldprt, or Onshape link) if your project has 3D models"
      end
      ShipCheckService::CheckResult.new(
        key: "has_cad_files",
        label: DEFINITION[:label],
        status: passed ? :passed : :warn,
        message: message,
        visibility: :user
      )
    end

    # Scan README and any markdown/txt files in the tree for cad.onshape.com links
    def self.onshape_link_in_docs?(ctx)
      return true if ctx.readme_content&.match?(%r{cad\.onshape\.com}i)

      tree = ctx.repo_tree || []
      tree.any? do |path|
        next unless path.match?(/\.(md|markdown|txt)$/i)
        next if File.basename(path).match?(/\Areadme/i)

        content = ctx.file_content(path)
        content&.match?(%r{cad\.onshape\.com}i)
      end
    end
  end
end
