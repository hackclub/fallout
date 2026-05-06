# frozen_string_literal: true

module ShipChecks
  # Locates the best screenshot URL for the YSWS Unified Submissions row.
  # Strategy in priority order:
  #
  #   1a. Filename regex match in the repo tree (zine|poster|flyer|magazine|page
  #       + image/PDF extension). Fast, no LLM.
  #   1b. LLM filter on all image/PDF files in the repo tree (covers zines that
  #       weren't named obviously — e.g. "submission.pdf", "{project}.png").
  #       Cheap text-only LLM call over filenames.
  #   1c. LLM search of README image descriptions for a zine specifically
  #       (reuses ctx.image_descriptions, already memoized for HasZinePage).
  #   2.  Fallback when no zine is found: LLM picks the best representative
  #       image of the project from the README (an entire assembly, the
  #       finished build on a desk, etc.) so the row still has a usable
  #       screenshot.
  module UnifiedScreenshotFinder
    def self.find_url(project)
      ctx = SharedContext.new(project)

      find_zine_by_filename_in_tree(ctx) ||
        find_zine_in_tree_via_llm(ctx) ||
        find_zine_in_readme_via_llm(ctx) ||
        find_representative_in_readme_via_llm(ctx)
    rescue StandardError => e
      Rails.logger.error("UnifiedScreenshotFinder failed for project ##{project.id}: #{e.class}: #{e.message}")
      nil
    end

    # 1a: deterministic file lookup — same regex HasZinePage uses for its
    # existence check. Cheap; no LLM call.
    def self.find_zine_by_filename_in_tree(ctx)
      tree = ctx.repo_tree
      return nil if tree.nil?

      nwo = ctx.repo_meta&.dig("full_name")
      branch = ctx.repo_meta&.dig("default_branch") || "main"
      return nil unless nwo

      path = tree.find do |p|
        name = File.basename(p).downcase
        HasZinePage.image_ext?(name) && name.match?(HasZinePage::ZINE_FILENAME_PATTERN)
      end
      return nil unless path

      raw_url(nwo, branch, path)
    end

    # 1b: list every image/PDF file in the tree and ask the LLM which is the
    # zine. Returns nil if the LLM doesn't pick one (NONE / unparseable).
    def self.find_zine_in_tree_via_llm(ctx)
      tree = ctx.repo_tree
      return nil if tree.nil?

      nwo = ctx.repo_meta&.dig("full_name")
      branch = ctx.repo_meta&.dig("default_branch") || "main"
      return nil unless nwo

      candidates = tree.select { |p| HasZinePage.image_ext?(File.basename(p).downcase) }
      return nil if candidates.empty?
      return raw_url(nwo, branch, candidates.first) if candidates.size == 1

      project_desc = ctx.project.description.presence || "a hardware/electronics project"

      chat = RubyLLM.chat
      response = chat.ask(<<~PROMPT)
        A hackathon submission zine is a single-page promotional poster (PDF or image) summarizing a project — a poster-like document with the project name, description, photos, and creator info.

        Project: #{project_desc}

        These are the image and PDF files in the repository. Filename and folder may give hints (e.g. "poster.pdf", "submission.png", files under "/zine/" or "/docs/").

        Files (numbered):
        #{candidates.map.with_index(1) { |p, i| "#{i}. #{p}" }.join("\n")}

        Respond with EXACTLY one line:
        - The number of the zine file (e.g. "3"), OR
        - "NONE" if no file looks like a zine (e.g., they all look like icons, schematics, or part photos).
      PROMPT

      index = parse_llm_index(response.content, candidates.size)
      return nil unless index
      raw_url(nwo, branch, candidates[index - 1])
    rescue StandardError => e
      Rails.logger.warn("UnifiedScreenshotFinder.find_zine_in_tree_via_llm failed: #{e.message}")
      nil
    end

    # 1c: ask the LLM if any README image is a zine, using descriptions
    # already memoized for HasZinePage. No additional vision cost.
    def self.find_zine_in_readme_via_llm(ctx)
      urls, descriptions = readme_urls_and_descriptions(ctx)
      return nil if urls.blank? || descriptions.blank?

      project_desc = ctx.project.description.presence || "a hardware/electronics project"

      chat = RubyLLM.chat
      response = chat.ask(<<~PROMPT)
        You are reviewing #{descriptions.size} images from the README for project: #{project_desc}

        Identify which image (if any) is a zine page — a single-page promotional poster that showcases the project with a central graphic, project description, and personal info.

        Image descriptions:
        #{descriptions.map.with_index(1) { |d, i| "#{i}. #{d}" }.join("\n")}

        Respond with EXACTLY one line:
        - The number of the zine image (e.g. "3"), OR
        - "NONE" if no image is a zine.
      PROMPT

      index = parse_llm_index(response.content, urls.size)
      index ? urls[index - 1] : nil
    rescue StandardError => e
      Rails.logger.warn("UnifiedScreenshotFinder.find_zine_in_readme_via_llm failed: #{e.message}")
      nil
    end

    # 2: fallback — find the best representative image of the project as a
    # whole (entire assembly, finished build, etc.) for the YSWS row when no
    # zine exists.
    def self.find_representative_in_readme_via_llm(ctx)
      urls, descriptions = readme_urls_and_descriptions(ctx)
      return nil if urls.blank? || descriptions.blank?

      name = ctx.project.name.presence || "this project"
      description = ctx.project.description.presence || "a hardware/electronics project"

      chat = RubyLLM.chat
      response = chat.ask(<<~PROMPT)
        These images were extracted from the project's GitHub repository's README. This project is called #{name} with the description #{description}.

        A suitable representation of the project is one that demonstrates the project in its entirety. It should show as many features as it can. For example, a screenshot of the final project on a desk is acceptable, a screenshot of code is not. Prefer entire assemblies over individual parts (e.g. entire render over pcb). This image is intended for our internal database to be able to see what a project is at a glance.

        Image descriptions:
        #{descriptions.map.with_index(1) { |d, i| "#{i}. #{d}" }.join("\n")}

        Respond with EXACTLY one line:
        - The number of the best image (e.g. "3"), OR
        - "NONE" if none of the images suitably represents the project.
      PROMPT

      index = parse_llm_index(response.content, urls.size)
      index ? urls[index - 1] : nil
    rescue StandardError => e
      Rails.logger.warn("UnifiedScreenshotFinder.find_representative_in_readme_via_llm failed: #{e.message}")
      nil
    end

    def self.raw_url(nwo, branch, path)
      "https://raw.githubusercontent.com/#{nwo}/#{branch}/#{path}"
    end

    # Parallel arrays of README image URLs and descriptions, both filtered to
    # the same set (badges/SVGs stripped, capped at MAX_IMAGES). Returns
    # [nil, nil] if the lists don't align — e.g. some downloads failed in
    # describe_all and the description count diverges from the URL count.
    def self.readme_urls_and_descriptions(ctx)
      return [ nil, nil ] unless ctx.readme_content && ctx.repo_meta

      urls = ReadmeImageDescriptions.extract_image_urls(ctx.readme_content, ctx)
                                    .reject { |u| ReadmeImageDescriptions.badge_or_svg?(u) }
                                    .first(ReadmeImageDescriptions::MAX_IMAGES)
      descriptions = ctx.image_descriptions
      return [ nil, nil ] if urls.blank? || descriptions.blank? || urls.size != descriptions.size

      [ urls, descriptions ]
    end

    def self.parse_llm_index(raw_content, max_index)
      return nil if raw_content.blank?
      raw = raw_content.to_s.strip.lines.first.to_s.strip
      return nil if raw.upcase.start_with?("NONE")

      index = raw.match(/\A(\d+)/)&.[](1)&.to_i
      return nil if index.nil? || index < 1 || index > max_index
      index
    end
  end
end
