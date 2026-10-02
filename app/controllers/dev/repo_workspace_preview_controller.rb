class Dev::RepoWorkspacePreviewController < ApplicationController
  allow_unauthenticated_access only: :show # Dev-only UI sandbox for the review Repo view; reads only public GitHub data
  # No model to authorize — sandbox page (no index action, so blanket skip)
  skip_after_action :verify_authorized
  skip_after_action :verify_policy_scoped

  DEFAULT_REPO = "https://github.com/LizOnAir/Camera"

  def show
    repo_link = params[:repo].presence || DEFAULT_REPO
    owner, repo = GithubService.parse_repo(repo_link)
    tree = owner ? GithubService.repo_tree(owner, repo) : nil
    render inertia: "dev/RepoWorkspacePreview", props: { repo_link: repo_link, repo_tree: tree }
  end
end
