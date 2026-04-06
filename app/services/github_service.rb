require "faraday"
require "json"

module GithubService
  class Error < StandardError; end

  BASE_URL = "https://gh-proxy.hackclub.com"

  module_function

  def get(path, params = {})
    response = connection.get("/gh/#{path}") do |req|
      req.params = params
      req.headers["Accept"] = "application/json"
    end

    handle_response(response)
  end

  def graphql(query, variables = {})
    response = connection.post("/gh/graphql") do |req|
      req.headers["Content-Type"] = "application/json"
      req.body = { query: query, variables: variables }.to_json
    end

    handle_response(response)
  end

  def repo(owner, repo)
    get("repos/#{owner}/#{repo}")
  end

  def user(username)
    get("users/#{username}")
  end

  def user_repos(username, **params)
    get("users/#{username}/repos", params)
  end

  def repo_tree(owner, repo, branch = nil)
    meta = self.repo(owner, repo)
    branch ||= meta.dig("default_branch") || "main"
    data = get("repos/#{owner}/#{repo}/git/trees/#{branch}", recursive: 1)
    tree = data["tree"]&.map { |f| { path: f["path"], type: f["type"], size: f["size"] } }
    {
      entries: tree,
      default_branch: branch,
      pushed_at: meta["pushed_at"],
      created_at: meta["created_at"]
    }
  rescue Error
    nil
  end

  def handle_response(response)
    case response.status
    when 200..299
      JSON.parse(response.body)
    when 429
      raise Error, "GitHub proxy rate limit exceeded"
    else
      raise Error, "GitHub proxy request failed (#{response.status})"
    end
  end

  def connection
    @connection ||= Faraday.new(url: BASE_URL) do |f|
      f.headers["X-API-Key"] = api_key
    end
  end

  def api_key
    ENV.fetch("GH_PROXY_API_KEY")
  end
end
