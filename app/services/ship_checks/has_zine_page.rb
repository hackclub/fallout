# frozen_string_literal: true

module ShipChecks
  module HasZinePage
    DEFINITION = { key: :has_zine_page, label: "Zine page in repository", deps: [ :repo_tree, :readme_content, :image_descriptions ], visibility: :user }.freeze

    ZINE_FILENAME_PATTERN = /zine|poster|flyer|magazine|page/i

    def self.call(ctx)
      tree = ctx.repo_tree
      if tree.nil?
        msg = ctx.non_github_repo? ? "Skipped (non-GitHub repository)" : "Repository not accessible"
        return ShipCheckService::CheckResult.new(
          key: "has_zine_page", label: DEFINITION[:label],
          status: :skipped, message: msg, visibility: :user
        )
      end

      # Check 1: file in tree with zine-related name
      has_file = tree.any? do |path|
        name = File.basename(path).downcase
        image_ext?(name) && name.match?(ZINE_FILENAME_PATTERN)
      end

      # Check 2: README references a zine/poster
      has_readme_ref = ctx.readme_content&.match?(ZINE_FILENAME_PATTERN) || false

      # Check 3: LLM — do any README images look like a zine page?
      has_zine_image = zine_in_images?(ctx)

      if has_file || has_readme_ref || has_zine_image
        ShipCheckService::CheckResult.new(
          key: "has_zine_page", label: DEFINITION[:label],
          status: :passed, message: nil, visibility: :user
        )
      else
        ShipCheckService::CheckResult.new(
          key: "has_zine_page", label: DEFINITION[:label],
          status: :warn, message: "Add an A5 zine/poster page to your repository and README",
          visibility: :user
        )
      end
    end

    def self.image_ext?(name)
      name.match?(/\.(png|jpe?g|gif|webp|svg|pdf)$/i)
    end

    def self.zine_in_images?(ctx)
      descriptions = ctx.image_descriptions
      return false if descriptions.nil? || descriptions.empty?

      chat = RubyLLM.chat(provider: :openrouter)
      response = chat.ask(<<~PROMPT)
        Based on these image descriptions from a hardware project README, does any image appear to be a zine page, poster, or flyer? A zine page is a single-page promotional poster that showcases the project with a central graphic, project description, and personal info.

        Image descriptions:
        #{descriptions.map.with_index(1) { |d, i| "#{i}. #{d}" }.join("\n")}

        Respond with exactly YES or NO.
      PROMPT

      response.content.strip.start_with?("YES")
    rescue StandardError
      false
    end
  end
end
