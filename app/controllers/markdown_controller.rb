class MarkdownController < ApplicationController
  allow_unauthenticated_access only: %i[show]
  allow_trial_access only: %i[show]

  def show
    slug = params[:slug].to_s
    slug = "index" if slug.blank?
    not_found unless valid_slug?(slug)

    base = Rails.root.join("docs")
    candidates = if slug == "index"
      [ base.join("index.md") ]
    else
      [ base.join("#{slug}.md"), base.join(slug, "index.md") ]
    end

    path = candidates.find { |p| File.exist?(p.to_s) }
    not_found unless path
    not_found unless File.expand_path(path).start_with?(File.expand_path(base))

    content_html = helpers.render_markdown_file(path)
    meta = helpers.docs_meta_for_url("/docs#{slug == 'index' ? '' : "/#{slug}"}")
    page_title = meta&.dig(:title).presence || slug.tr("-_/", " ").split.map(&:capitalize).join(" ")

    render inertia: {
      content_html: content_html,
      page_title: page_title
    }
  end

  private

  def valid_slug?(slug)
    return true if slug == "index"
    return false if slug.include?("..") || slug.start_with?("/")

    slug.match?(%r{\A[a-z0-9_\-/]+\z})
  end

  def not_found
    raise ActionController::RoutingError, "Not Found"
  end
end
