# frozen_string_literal: true

require "net/http"
require "json"
require "base64"

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

    def repo_tree
      @repo_tree ||= fetch_repo_tree
    end

    def readme_content
      @readme_content ||= fetch_readme_content
    end

    def bom_content
      @bom_content ||= fetch_bom_content
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

    private

    def github_api(path)
      return nil unless github_nwo
      uri = URI("https://api.github.com#{path}")
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = true
      http.open_timeout = ShipCheckService::GITHUB_TIMEOUT
      http.read_timeout = ShipCheckService::GITHUB_TIMEOUT
      request = Net::HTTP::Get.new(uri)
      request["Accept"] = "application/vnd.github.v3+json"
      request["User-Agent"] = "Fallout-Preflight"
      response = http.request(request)
      return nil unless response.is_a?(Net::HTTPSuccess)
      JSON.parse(response.body)
    rescue StandardError
      nil
    end

    def fetch_repo_meta
      return nil if project.repo_link.blank?
      github_api("/repos/#{github_nwo}")
    end

    def fetch_repo_tree
      return nil unless repo_meta
      branch = repo_meta["default_branch"] || "main"
      data = github_api("/repos/#{github_nwo}/git/trees/#{branch}?recursive=1")
      data&.dig("tree")&.map { |f| f["path"] }
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
  end
end
