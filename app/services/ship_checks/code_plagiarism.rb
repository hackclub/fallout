# frozen_string_literal: true

require "base64"

module ShipChecks
  module CodePlagiarism
    DEFINITION = { key: :code_plagiarism, label: "Source files are original", deps: [ :repo_tree ], visibility: :internal }.freeze

    CATEGORIES = {
      code: %w[.ino .py .c .cpp .h .js .ts .rs .go],
      pcb: %w[.kicad_pro .kicad_sch .kicad_pcb],
      eda: %w[.epro .eprj],
      cad: %w[.step .stp]
    }.freeze

    SAMPLES_PER_FILE = 3
    MAX_FILES = 5
    MIN_LINE_LENGTH = 15
    MAX_QUERY_LENGTH = 256

    def self.call(ctx)
      tree = ctx.repo_tree
      return skip(ctx.non_github_repo? ? "Skipped (non-GitHub repository)" : "Repository not accessible") if tree.nil?

      repo_nwo = ctx.repo_meta&.dig("full_name")
      return skip("Repository metadata not available") unless repo_nwo

      files = select_files(tree)
      return skip("No checkable source files found") if files.empty?

      files.each do |path|
        content = ctx.file_content(path)
        next unless content&.valid_encoding?

        match = check_file(content, path, repo_nwo)
        next unless match

        # Early exit — first flagged file is enough
        return ShipCheckService::CheckResult.new(
          key: "code_plagiarism", label: DEFINITION[:label],
          status: :warn, message: format_message(path, match), visibility: :internal
        )
      end

      ShipCheckService::CheckResult.new(
        key: "code_plagiarism", label: DEFINITION[:label],
        status: :passed, message: nil, visibility: :internal
      )
    rescue StandardError
      skip("Code plagiarism check unavailable")
    end

    def self.format_message(local_path, match)
      local_lines = match[:local_lines].uniq.sort.join(", ")
      external_lines = match[:external_lines].uniq.sort
      external_suffix = external_lines.any? ? " lines #{external_lines.join(", ")}" : ""
      "#{File.basename(local_path)} lines #{local_lines} match #{match[:repo]}:#{match[:path]}#{external_suffix}"
    end

    # Pick up to MAX_FILES, distributed across categories
    def self.select_files(tree)
      by_category = CATEGORIES.transform_values do |exts|
        tree.select { |p| exts.include?(File.extname(p).downcase) }
      end.reject { |_, v| v.empty? }

      return [] if by_category.empty?

      selected = []
      per_category = [ (MAX_FILES.to_f / by_category.size).ceil, 2 ].min

      by_category.each_value do |paths|
        selected.concat(paths.sample(per_category))
        break if selected.size >= MAX_FILES
      end

      selected.first(MAX_FILES)
    end

    # Take 3 samples from different parts of the file, search each on GitHub.
    # If 2+ samples match the same external repo+path, return match details
    # (repo, path, sampled local line numbers, matched external line numbers).
    def self.check_file(content, _path, repo_nwo)
      numbered_lines = content.lines.each_with_index.filter_map do |raw, idx|
        stripped = raw.strip
        meaningful_line?(stripped) ? [ stripped, idx + 1 ] : nil
      end
      return nil if numbered_lines.size < SAMPLES_PER_FILE

      samples = pick_samples(numbered_lines)
      # (repo, path) => [{ sample:, local_line: }, ...]
      hits = Hash.new { |h, k| h[k] = [] }

      samples.each do |line_text, line_no|
        search_github(line_text, repo_nwo).each do |repo, path|
          hits[[ repo, path ]] << { sample: line_text, local_line: line_no }
        end
      end

      key, matched_samples = hits.find { |_, list| list.size >= 2 }
      return nil unless key

      repo, ext_path = key
      {
        repo: repo,
        path: ext_path,
        local_lines: matched_samples.map { |s| s[:local_line] },
        external_lines: find_external_lines(repo, ext_path, matched_samples.map { |s| s[:sample] })
      }
    end

    # Pick samples from top, middle, and bottom thirds of the file
    def self.pick_samples(numbered_lines)
      third = numbered_lines.size / 3
      [
        numbered_lines[0...third],
        numbered_lines[third...(third * 2)],
        numbered_lines[(third * 2)..]
      ].filter_map { |segment| segment&.sample }
    end

    def self.search_github(line, repo_nwo)
      query = "\"#{sanitize_query(line)}\" -repo:#{repo_nwo}"
      query = query[0...MAX_QUERY_LENGTH]

      results = GithubService.get("search/code", q: query)
      (results["items"] || []).filter_map do |item|
        repo = item.dig("repository", "full_name")
        path = item["path"]
        repo && path ? [ repo, path ] : nil
      end.uniq
    rescue GithubService::Error
      []
    end

    # Fetch the matched external file and locate which line each sample appears on.
    # Best-effort — returns [] if the fetch fails or samples can't be located verbatim
    # (GitHub code search tokenizes, so an exact-substring match isn't guaranteed).
    def self.find_external_lines(repo, path, samples)
      data = GithubService.get("repos/#{repo}/contents/#{path}")
      return [] unless data.is_a?(Hash) && data["content"]

      content = Base64.decode64(data["content"]).force_encoding("UTF-8").scrub("")
      lines = content.lines.map(&:strip)
      samples.filter_map do |sample|
        idx = lines.index { |l| l.include?(sample) }
        idx ? idx + 1 : nil
      end
    rescue GithubService::Error, StandardError
      []
    end

    def self.sanitize_query(line)
      line.gsub('"', "").strip[0..200]
    end

    def self.meaningful_line?(line)
      return false if line.length < MIN_LINE_LENGTH
      return false if line.start_with?("//", "#", "/*", "*", "--", ";")
      return false if line.match?(/\A[\s{}()\[\];,]+\z/)
      true
    end

    def self.skip(message)
      ShipCheckService::CheckResult.new(
        key: "code_plagiarism", label: DEFINITION[:label],
        status: :skipped, message: message, visibility: :internal
      )
    end
  end
end
