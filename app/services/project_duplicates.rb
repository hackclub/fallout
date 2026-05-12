require "amatch"
require "faraday"
require "json"

# Each finder returns Array<Hash> with this shape:
#   { program:, external_id:, name:, github_url:, user_email:, user_slack_id: }
module ProjectDuplicates
  FUZZY_THRESHOLD = 0.85
  STASIS_CACHE_TTL = 1.hour
  STASIS_PAGE_LIMIT = 500

  module_function

  def fallout_candidates(project)
    normalized = normalize_github_url(project.repo_link)
    return [] if normalized.blank?

    Project.where.not(id: project.id)
           .where(id: Ship.select(:project_id))
           .where("repo_link ILIKE ?", "%#{normalized}%")
           .includes(:user)
           .filter_map do |p|
      next unless normalize_github_url(p.repo_link) == normalized

      { program: "fallout", external_id: p.id.to_s, name: p.name,
        github_url: p.repo_link, user_email: p.user&.email, user_slack_id: p.user&.slack_id }
    end
  end

  # Returns all submitted Stasis projects, cached for 1 hour. ~1000 projects, ~2.5s full sync.
  def stasis_candidates(_project = nil)
    Rails.cache.fetch("project_duplicates:stasis:all", expires_in: STASIS_CACHE_TTL) { fetch_stasis_all } || []
  end

  def find_duplicate(project, candidates)
    normalized = normalize_github_url(project.repo_link)
    if normalized
      candidates.find { |c| normalize_github_url(c[:github_url]) == normalized }
    else
      user = project.user
      candidates.find do |c|
        identity_match = (c[:user_email].present? && c[:user_email] == user.email) ||
                         (c[:user_slack_id].present? && c[:user_slack_id] == user.slack_id)
        identity_match && fuzzy_name_match?(project.name, c[:name])
      end
    end
  end

  def normalize_github_url(url)
    return nil if url.blank?

    m = url.match(%r{github\.com/([^/]+)/([^/?#]+?)(?:\.git)?(?:[/?#]|$)}i)
    m && "#{m[1].downcase}/#{m[2].downcase}"
  end

  def normalize_name(name)
    name.to_s.downcase.gsub(/[^a-z0-9]+/, " ").strip
  end

  def fuzzy_name_match?(a, b)
    a_n = normalize_name(a)
    b_n = normalize_name(b)
    return false if a_n.empty? || b_n.empty?

    Amatch::JaroWinkler.new(a_n).match(b_n) >= FUZZY_THRESHOLD
  end

  # Only function aware of the Stasis API; swap this to swap data sources.
  # Paginates GET /api/integrations/projects?submittedOnly=true via cursor.
  def fetch_stasis_all
    cursor = nil
    all = []
    loop do
      params = { limit: STASIS_PAGE_LIMIT, submittedOnly: true }
      params[:cursor] = cursor if cursor
      response = stasis_connection.get("/api/integrations/projects", params)

      unless response.success?
        ErrorReporter.capture_message("Stasis lookup failed", level: :warning,
          contexts: { stasis: { status: response.status } })
        return nil
      end

      body = JSON.parse(response.body)
      body.fetch("items", []).each do |p|
        all << {
          program: "stasis",
          external_id: p["id"].to_s,
          name: p["title"],
          github_url: p["githubRepo"],
          user_email: p.dig("user", "email"),
          user_slack_id: p.dig("user", "slackId")
        }
      end
      cursor = body["nextCursor"]
      break if cursor.blank?
    end
    all
  rescue StandardError => e
    ErrorReporter.capture_exception(e, contexts: { stasis: { action: "lookup" } })
    nil
  end

  def stasis_connection
    @stasis_connection ||= Faraday.new(url: ENV.fetch("STASIS_API_URL", "https://stasis.hackclub.com")) do |f|
      f.options.open_timeout = 5
      f.options.timeout = 15
      f.headers["Authorization"] = "Bearer #{ENV.fetch('STASIS_API_KEY', '')}"
    end
  end
end
