# frozen_string_literal: true

require "base64"
require "csv"

module ShipChecks
  # Holds memoized fetched data shared across checks.
  # Fetcher methods are called by the runner before dependent checks execute.
  # Memoization is safe because each fetcher is resolved sequentially in phase 1.
  class SharedContext
    attr_reader :project

    def initialize(project)
      @project = project
    end

    def repo_meta
      @repo_meta ||= fetch_repo_meta
    end

    # HEAD commit SHA of the default branch — the true content identity used to key
    # cached check results so a push always busts the cache. nil if it can't be resolved.
    def head_sha
      @head_sha ||= fetch_head_sha
    end

    def repo_tree
      @repo_tree ||= fetch_repo_tree
    end

    def readme_content
      @readme_content ||= fetch_readme_content
    end

    def bom_content
      @bom_content ||= fetch_bom_content
    end

    # Repo path of the detected BOM file, or nil. Lets checks distinguish a
    # text CSV from a binary .xlsx that can't be parsed as text.
    def bom_path
      return @bom_path if defined?(@bom_path)
      @bom_path = repo_tree ? find_bom_path : nil
    end

    # Shared parse outcome for a CSV BOM so the formatting and links checks
    # agree. Returns :no_csv (missing or non-CSV BOM), :malformed (present but
    # unparseable), or the parsed Array of rows.
    def bom_csv
      return @bom_csv if defined?(@bom_csv)
      @bom_csv = parse_bom_csv
    end

    def file_content(path)
      data = github_api("/repos/#{github_nwo}/contents/#{path}")
      return nil unless data&.key?("content")
      # Scrub invalid byte sequences so downstream regex/string ops don't raise on non-UTF-8 repo files
      Base64.decode64(data["content"]).force_encoding("UTF-8").scrub("")
    end

    # Vision LLM descriptions of README images, memoized for downstream checks
    def image_descriptions
      @image_descriptions ||= fetch_image_descriptions
    end

    # Ordered list of image URLs extracted from README (same order as image_descriptions)
    def readme_image_urls
      @readme_image_urls ||= fetch_readme_image_urls
    end

    private

    def fetch_image_descriptions
      return nil unless readme_content && repo_meta
      ShipChecks::ReadmeImageDescriptions.describe_all(self)
    end

    def fetch_readme_image_urls
      return nil unless readme_content && repo_meta
      ShipChecks::ReadmeImageDescriptions.extract_image_urls(readme_content, self)
    end

    def github_nwo
      @github_nwo ||= begin
        match = project.repo_link&.match(%r{github\.com/([^/]+)/([^/]+?)(?:\.git)?(?:/|$)})
        match ? "#{match[1]}/#{match[2]}" : nil
      end
    end

    public

    # True when repo_link points to a non-GitHub host (GitLab, self-hosted, etc.)
    def non_github_repo?
      project.repo_link.present? && github_nwo.nil?
    end

    def github_rate_limited?
      @github_rate_limited || false
    end

    private

    def github_api(path)
      return nil unless github_nwo
      clean_path = path.sub(%r{\A/}, "")
      uri = URI(clean_path)
      params = uri.query ? URI.decode_www_form(uri.query).to_h : {}
      GithubService.get(uri.path, params)
    rescue GithubService::Error => e
      @github_rate_limited = true if e.message.include?("rate limit")
      nil
    rescue StandardError
      nil
    end

    def fetch_repo_meta
      return nil if project.repo_link.blank?
      github_api("/repos/#{github_nwo}")
    end

    def fetch_head_sha
      return nil unless repo_meta
      branch = repo_meta["default_branch"] || "main"
      github_api("/repos/#{github_nwo}/git/ref/heads/#{branch}")&.dig("object", "sha")
    end

    def fetch_repo_tree
      return nil unless repo_meta
      branch = repo_meta["default_branch"] || "main"
      data = github_api("/repos/#{github_nwo}/git/trees/#{branch}?recursive=1")
      return nil unless data
      entries = data["tree"] || []
      paths = entries.map { |f| f["path"] }

      # Submodules appear as type "commit" — fetch their trees too
      submodule_nwos = fetch_submodule_nwos
      submodule_nwos.each do |nwo|
        sub_meta = github_api("/repos/#{nwo}")
        next unless sub_meta
        sub_branch = sub_meta["default_branch"] || "main"
        sub_data = github_api("/repos/#{nwo}/git/trees/#{sub_branch}?recursive=1")
        next unless sub_data
        sub_paths = (sub_data["tree"] || []).map { |f| f["path"] }
        paths.concat(sub_paths)
      end

      paths
    end

    def fetch_submodule_nwos
      data = github_api("/repos/#{github_nwo}/contents/.gitmodules")
      return [] unless data&.key?("content")
      content = Base64.decode64(data["content"]).force_encoding("UTF-8").scrub("")
      content.scan(%r{url\s*=\s*.*github\.com[:/]([^/\s]+/[^\s.]+)}).flatten
    rescue StandardError
      []
    end

    def fetch_readme_content
      return nil unless repo_meta
      data = github_api("/repos/#{github_nwo}/readme")
      return nil unless data&.key?("content")
      # Scrub invalid byte sequences so downstream regex/string ops don't raise on non-UTF-8 README bytes
      Base64.decode64(data["content"]).force_encoding("UTF-8").scrub("")
    end

    def fetch_bom_content
      return nil unless repo_tree
      bom_path = find_bom_path
      return nil unless bom_path
      data = github_api("/repos/#{github_nwo}/contents/#{bom_path}")
      return nil unless data&.key?("content")
      # Scrub invalid byte sequences so downstream regex/string ops don't raise on non-UTF-8 BOM bytes
      Base64.decode64(data["content"]).force_encoding("UTF-8").scrub("")
    end

    def find_bom_path
      repo_tree.find do |p|
        name = File.basename(p).downcase
        name.end_with?(".csv", ".xlsx") && name.match?(/bom|bill.of.material/)
      end
    end

    def parse_bom_csv
      return :no_csv unless bom_content && bom_path&.downcase&.end_with?(".csv")
      # Fail closed: any parse error (malformed CSV, bad encoding, etc.) on this
      # user-supplied file is reported as :malformed rather than raising.
      # Normalize ", "field"" → ","field"" so spaces after delimiters don't
      # cause Ruby's strict CSV parser to treat a quoted value as unquoted.
      normalized = bom_content.gsub(/,[ \t]+(?=")/, ",")
      CSV.parse(normalized)
    rescue StandardError
      :malformed
    end
  end
end
