require "redcarpet"
require "uri"
require "digest"

module MarkdownHelper
  # Hosts allowed to serve images in user-generated content (e.g. journals).
  # Same-origin images (Active Storage, relative paths) are always allowed.
  ALLOWED_IMAGE_HOSTS = %w[
    hc-cdn.hel1.your-objectstorage.com
    cdn.hackclub.com
    github.com
    raw.githubusercontent.com
  ].freeze

  # Tags permitted in sanitized user-generated HTML
  ALLOWED_UGC_TAGS = %w[
    p br em strong i b u s del strike sup sub
    h1 h2 h3 h4 h5 h6
    ul ol li
    blockquote pre code hr
    a img
    table thead tbody tfoot tr th td
    input span div
  ].freeze

  # Attributes permitted in sanitized user-generated HTML
  ALLOWED_UGC_ATTRIBUTES = %w[
    href rel target
    src alt title width height loading
    type checked disabled
    class
  ].freeze

  def self.canonical_base_url
    host = ENV["APPLICATION_HOST"]
    host.present? ? "https://#{host}" : nil
  end

  class GuidesLinkRenderer < Redcarpet::Render::HTML
    def initialize(options = {})
      @base_url = options[:base_url]
      super
    end

    def link(href, title, content)
      href = href.to_s
      # Whitelist allowed protocols — anything else (javascript:, data:, vbscript:, etc.)
      # renders as inert text so autolinked malicious URLs can't reach the DOM as <a>.
      return ERB::Util.html_escape(content) unless safe_href?(href)

      attrs = []
      attrs << %(href="#{ERB::Util.html_escape(href)}")
      attrs << %(title="#{ERB::Util.html_escape(title)}") if title

      if !guide_internal_link?(href) && !same_origin?(href)
        attrs << %(target="_blank")
        attrs << %(rel="nofollow noopener")
      end

      "<a #{attrs.join(' ')}>#{content}</a>"
    end

    def safe_href?(href)
      href.start_with?("#", "/", "./", "../") ||
        href.match?(/\Ahttps?:\/\//i) ||
        href.match?(/\Amailto:/i)
    end

    def guide_internal_link?(href)
      return false if href.start_with?("#")
      return true  if href.start_with?("./", "../")
      if href.start_with?("/")
        return href.start_with?("/docs")
      end
      return false if href =~ /\A[a-z][a-z0-9+.-]*:/i
      true
    end

    private

    def same_origin?(href)
      return true if href.start_with?("/", "#", "./", "../")
      return false unless href =~ /\Ahttps?:\/\//i
      return false unless @base_url

      begin
        base = URI.parse(@base_url)
        u = URI.parse(href)
        base.scheme == u.scheme && base.host == u.host && (base.port || default_port(base.scheme)) == (u.port || default_port(u.scheme))
      rescue URI::InvalidURIError
        false
      end
    end

    def default_port(scheme)
      scheme.to_s.downcase == "https" ? 443 : 80
    end
  end

  # Renders user-generated markdown (journals, etc.) with HTML sanitization.
  # Uses escape_html to turn raw HTML in source into visible text (not rendered).
  # External images from untrusted hosts are replaced with a link callout.
  def render_user_markdown(text)
    base_url = MarkdownHelper.canonical_base_url || (request.base_url rescue nil)

    renderer = GuidesLinkRenderer.new(
      with_toc_data: true,
      hard_wrap: true,
      escape_html: true, # Escape raw HTML in user input — renders as literal text
      prettify: true,
      base_url: base_url
    )
    md = Redcarpet::Markdown.new(
      renderer,
      autolink: true,
      tables: true,
      fenced_code_blocks: true,
      strikethrough: true,
      lax_spacing: true,
      space_after_headers: true,
      footnotes: true
    )

    html = md.render(text)
    sanitize_user_html(html)
  end

  def sanitize_user_html(html)
    sanitized = sanitize(html.to_s, tags: ALLOWED_UGC_TAGS, attributes: ALLOWED_UGC_ATTRIBUTES)

    doc = Nokogiri::HTML::DocumentFragment.parse(sanitized)

    doc.css("img[src]").each do |img|
      src = img["src"].to_s

      if external_link?(src) && !allowed_image_host?(src)
        wrapper = Nokogiri::XML::Node.new("div", doc)
        wrapper["class"] = "external-image-callout"
        wrapper.add_child(Nokogiri::XML::Text.new("External images are not supported. ", doc))

        link = Nokogiri::XML::Node.new("a", doc)
        link["href"] = src
        link["rel"] = "nofollow noopener"
        link["target"] = "_blank"
        link.content = "View original"

        wrapper.add_child(link)
        img.replace(wrapper)
      else
        img["loading"] = "lazy"
      end
    end

    doc.css("a[href]").each do |a|
      href = a["href"].to_s

      # Strip links whose protocol isn't on the whitelist (javascript:, data:, etc.).
      # Replace the element with its inner text so the payload shows as plain characters.
      unless href.start_with?("#", "/", "./", "../") ||
             href.match?(/\Ahttps?:\/\//i) ||
             href.match?(/\Amailto:/i)
        a.replace(Nokogiri::XML::Text.new(a.inner_text, doc))
        next
      end

      a["rel"] = "nofollow noopener"

      if external_link?(href)
        a["target"] = a["target"].presence || "_blank"
      end
    end

    doc.to_html.html_safe
  end

  def render_markdown(text, base_url: nil)
    base_url ||= MarkdownHelper.canonical_base_url || (request.base_url rescue nil)

    if defined?(@__markdown_renderer_base_url).nil? || @__markdown_renderer_base_url != base_url || @__markdown_renderer.nil?
      renderer = GuidesLinkRenderer.new(
        with_toc_data: true,
        hard_wrap: true,
        filter_html: false,
        prettify: true,
        base_url: base_url
      )
      @__markdown_renderer = Redcarpet::Markdown.new(
        renderer,
        autolink: true,
        tables: true,
        fenced_code_blocks: true,
        strikethrough: true,
        lax_spacing: true,
        space_after_headers: true,
        footnotes: true
      )
      @__markdown_renderer_base_url = base_url
    end

    processed = preprocess_checkboxes(text)
    html = preprocess_html_blocks(processed, @__markdown_renderer)
    postprocess_table_cells(html, @__markdown_renderer).html_safe
  end

  def postprocess_table_cells(html, renderer)
    html.gsub(%r{<td([^>]*)>(.*?)</td>}m) do
      attrs = Regexp.last_match(1)
      inner = Regexp.last_match(2).strip
      # Convert <br> back to newlines so the markdown renderer can create block elements
      md = inner.gsub(/<br\s*\/?>/, "\n")
      "<td#{attrs}>#{renderer.render(md)}</td>"
    end
  end

  def preprocess_checkboxes(text)
    text
      .gsub(/^(\s*)- \[ \] /m, '\1- <span class="checkbox-dont">&#x2717;</span> ')
      .gsub(/^(\s*)- \[x\] /im, '\1- <span class="checkbox-do">&#x2713;</span> ')
  end

  def preprocess_html_blocks(text, renderer)
    # Extract balanced top-level <aside>/<div> blocks from markdown before Redcarpet processes it.
    # Renders markdown inside leaf-level blocks, then splices the finished HTML back in as placeholders
    # so Redcarpet doesn't mangle nested HTML tags.
    placeholders = {}
    result = text

    # <html>...</html> blocks pass through with zero markdown processing.
    result = result.gsub(%r{^<html>[ \t]*\n(.*?)\n[ \t]*</html>}m) do
      key = "HTMLBLOCK#{placeholders.size}x#{SecureRandom.hex(4)}"
      placeholders[key] = Regexp.last_match(1)
      key
    end

    # Find and extract balanced top-level HTML blocks
    scan_from = 0
    loop do
      open_match = result.match(%r{^<(aside|div)(\s[^>]*)?>[ \t]*$}m, scan_from)
      break unless open_match

      tag = open_match[1]
      block_start = open_match.begin(0)
      search_from = open_match.end(0)
      depth = 1
      tag_re = %r{<(/?)(aside|div)[\s>/]}

      while depth > 0
        next_tag = tag_re.match(result, search_from)
        break unless next_tag
        search_from = next_tag.end(0)
        depth += (next_tag[1] == "/" && next_tag[2] == tag) ? -1 : (next_tag[1] == "" && next_tag[2] == tag ? 1 : 0)
      end

      # Skip malformed blocks where we never found the closing tag
      if depth > 0
        scan_from = open_match.end(0)
        next
      end

      block_html = result[block_start...search_from]
      # Render markdown inside leaf-level child blocks
      processed_block = block_html.gsub(%r{(<(?:aside|div)(?:\s[^>]*)?>)[ \t]*\n((?:(?!<(?:aside|div)[\s>]).)*?)\n[ \t]*(</(?:aside|div)>)}m) do
        "#{Regexp.last_match(1)}#{renderer.render(Regexp.last_match(2))}#{Regexp.last_match(3)}"
      end

      key = "HTMLBLOCK#{placeholders.size}x#{SecureRandom.hex(4)}"
      placeholders[key] = processed_block
      result = result[0...block_start] + key + result[search_from..]
      scan_from = block_start + key.length
    end

    # Let Redcarpet render the remaining markdown, then restore HTML blocks
    rendered = renderer.render(result)
    placeholders.each { |key, html| rendered.sub!(%r{<p>#{key}</p>|#{key}}, html) }
    rendered
  end

  def render_markdown_file(path, base_url: nil)
    base_url ||= MarkdownHelper.canonical_base_url || (request.base_url rescue nil)
    raw = File.read(path)
    cleaned = strip_front_matter_table(raw)

    html = if Rails.env.development?
      render_markdown(cleaned, base_url: base_url)
    else
      key = [ "guide_md_html", path.to_s, File.mtime(path).to_i, base_url ]
      Rails.cache.fetch(key) { render_markdown(cleaned, base_url: base_url) }
    end

    # Move src to data-src on <video> tags so the browser never fetches video
    # files on parse — React portals them lazily once near the viewport instead.
    # Add loading="lazy" to <img> tags so the browser defers off-screen image fetches.
    html
      .gsub(/<video([^>]*)\ssrc="([^"]*)"([^>]*)>/i) do
        "<video#{Regexp.last_match(1)} data-src=\"#{Regexp.last_match(2)}\"#{Regexp.last_match(3)}>"
      end
      .gsub(/<img(?![^>]*loading=)/i) do |match|
        match + ' loading="lazy"'
      end
      .html_safe
  end

  def docs_metadata(base:, url_prefix:, default_index_title: "")
    paths = Dir.glob(base.join("**/*.{md,mdx}").to_s)
    stats = paths.map { |p| [ p, File.mtime(p).to_i ] }.sort_by(&:first)
    return build_docs_metadata(base, url_prefix, default_index_title, paths) if Rails.env.development?

    stats_digest = Digest::SHA256.hexdigest(stats.flatten.join("|"))
    Rails.cache.fetch([ "docs_metadata", base.to_s, url_prefix, default_index_title, stats_digest ]) do
      build_docs_metadata(base, url_prefix, default_index_title, paths)
    end
  end

  def build_docs_metadata(base, url_prefix, default_index_title, paths)
    items = []
    paths.each do |p|
      rel = Pathname.new(p).relative_path_from(base).to_s

      slug = nil
      url  = nil
      if rel.match?(/\Aindex\.mdx?\z/)
        slug = ""
        url  = url_prefix
      else
        s = rel.sub(/\.mdx?\z/, "")
        if File.basename(s) == "index"
          dir = File.dirname(s)
          slug = (dir == "." ? "" : dir)
        else
          slug = s
        end
        url = slug.blank? ? url_prefix : "#{url_prefix}/#{slug}"
      end

      meta = parse_guide_metadata(p)
      fallback_title = if slug.blank?
        default_index_title
      else
        slug.tr("-_/", " ").split.map(&:capitalize).join(" ")
      end
      title = meta[:title].presence || fallback_title
      desc  = meta[:description].presence
      prio  = meta[:priority]
      unlisted = meta[:unlisted] || false
      items << { title: title, path: url, description: desc, slug: slug, file: p, priority: prio, unlisted: unlisted }
    end
    items
  end

  def docs_section_metadata
    base = Rails.root.join("docs")
    docs_metadata(base: base, url_prefix: "/docs", default_index_title: "Docs")
  end

  def docs_search_index
    base = Rails.root.join("docs")
    paths = Dir.glob(base.join("**/*.{md,mdx}").to_s)
    return build_docs_search_index(paths) if Rails.env.development?

    stats = paths.map { |p| [ p, File.mtime(p).to_i ] }.sort_by(&:first)
    stats_digest = Digest::SHA256.hexdigest(stats.flatten.join("|"))
    Rails.cache.fetch([ "docs_search_index", stats_digest ]) { build_docs_search_index(paths) }
  end

  def docs_menu_items
    docs_section_metadata
      .reject { |i| i[:slug].blank? || i[:unlisted] }
      .sort_by { |h| [ h[:priority].nil? ? Float::INFINITY : h[:priority].to_i, h[:title].downcase ] }
      .map { |i| { title: i[:title], path: i[:path], description: i[:description] } }
  end

  def docs_grouped_menu_items
    items = docs_section_metadata.reject { |i| i[:slug].blank? || i[:unlisted] }
    sort = ->(list) { list.sort_by { |h| [ h[:priority].nil? ? Float::INFINITY : h[:priority].to_i, h[:title].downcase ] } }

    top_level = []
    sections = {}

    items.each do |item|
      slug = item[:slug].to_s
      parts = slug.split("/")

      if parts.length <= 1
        top_level << item
      else
        section_key = parts.first
        sections[section_key] ||= []
        sections[section_key] << item
      end
    end

    # Build a unified list of top-level links and sections, each with a priority for sorting
    entries = sort.call(top_level).map { |i| { type: "link", title: i[:title], path: i[:path], priority: i[:priority] } }

    sections.each do |key, section_items|
      sorted = sort.call(section_items)
      meta = load_section_metadata(key)
      entries << {
        type: "section",
        title: meta[:title] || key.tr("-_", " ").split.map(&:capitalize).join(" "),
        items: sorted.map { |i| { title: i[:title], path: i[:path] } },
        priority: meta[:priority],
        default_open: meta[:default_open]
      }
    end

    entries.sort_by { |e| [ e[:priority].nil? ? Float::INFINITY : e[:priority].to_i, e[:title].downcase ] }
  end

  def docs_meta_for_url(url)
    docs_section_metadata.find { |i| i[:path] == url }
  end

  def menu_items_for(url_path)
    section = url_path.to_s.sub(%r{^/}, "")
    base = Rails.root.join("docs", section)
    return [] unless File.directory?(base)

    docs_metadata(base: base, url_prefix: url_path, default_index_title: section.titleize)
      .reject { |i| i[:slug].blank? || i[:unlisted] }
      .sort_by { |h| [ h[:priority].nil? ? Float::INFINITY : h[:priority].to_i, h[:title].downcase ] }
      .map { |i| { title: i[:title], path: i[:path], description: i[:description] } }
  end

  def meta_for_url(url_path, url)
    section = url_path.to_s.sub(%r{^/}, "")
    base = Rails.root.join("docs", section)
    return nil unless File.directory?(base)

    docs_metadata(base: base, url_prefix: url_path, default_index_title: section.titleize)
      .find { |i| i[:path] == url }
  end

  private

  def build_docs_search_index(paths)
    base = Rails.root.join("docs")
    paths.filter_map do |p|
      meta = parse_guide_metadata(p)
      next if meta[:unlisted]

      rel = Pathname.new(p).relative_path_from(base).to_s
      slug = rel.sub(/\.mdx?\z/, "")
      slug = File.dirname(slug) if File.basename(slug) == "index"
      slug = "" if slug == "."
      path = slug.blank? ? "/docs" : "/docs/#{slug}"

      raw = File.read(p)
      body = strip_front_matter_table(raw)
      # Strip markdown syntax to plain text for search
      excerpt = body
        .gsub(/^#+\s+/, "")         # headings
        .gsub(/\[([^\]]+)\]\([^)]+\)/, '\1') # links
        .gsub(/[*_`~]/, "")         # emphasis/code/strike
        .gsub(/\s+/, " ")
        .strip
        .slice(0, 500)

      title = meta[:title].presence || (slug.blank? ? "Docs" : slug.tr("-_/", " ").split.map(&:capitalize).join(" "))
      { title: title, path: path, excerpt: excerpt }
    rescue Errno::ENOENT
      nil
    end
  end

  def load_section_metadata(section_key)    path = Rails.root.join("docs", section_key, "metadata.yml")
    return { title: nil, priority: nil } unless File.exist?(path)

    data = YAML.safe_load(File.read(path)) || {}
    { title: data["title"], priority: data["priority"], default_open: data.fetch("default_open", true) }
  rescue
    { title: nil, priority: nil, default_open: true }
  end

  def external_link?(href)
    # Protocol-relative URLs (//host/path) resolve cross-origin in the browser; treat them as
    # external so allowed_image_host? gates them and they don't slip past the host allowlist.
    return true if href.start_with?("//")
    return false if href.start_with?("#", "/", "./", "../")
    return false unless href =~ /\Ahttps?:\/\//i

    base_url = MarkdownHelper.canonical_base_url || (request.base_url rescue nil)
    return true if base_url.blank?

    begin
      base = URI.parse(base_url)
      u = URI.parse(href)
      base.scheme != u.scheme || base.host != u.host ||
        (base.port || default_port(base.scheme)) != (u.port || default_port(u.scheme))
    rescue URI::InvalidURIError
      true
    end
  end

  def default_port(scheme)
    scheme.to_s.downcase == "https" ? 443 : 80
  end

  def allowed_image_host?(href)
    return false unless href =~ /\Ahttps?:\/\//i

    begin
      uri = URI.parse(href)
      ALLOWED_IMAGE_HOSTS.include?(uri.host)
    rescue URI::InvalidURIError
      false
    end
  end

  def strip_front_matter_table(text)
    lines = text.lines
    i = 0
    i += 1 while i < lines.length && lines[i].strip.empty?
    return text unless i < lines.length && lines[i].lstrip.start_with?("|")
    j = i
    while j < lines.length
      line = lines[j]
      break unless line.lstrip.start_with?("|") || line.strip.empty?
      j += 1
    end
    (lines[j..] || []).join.lstrip
  end

  def parse_guide_metadata(path)
    return build_guide_metadata(path) if Rails.env.development?

    key = [ "guide_md_meta", path.to_s, File.mtime(path).to_i ]
    Rails.cache.fetch(key) { build_guide_metadata(path) }
  end

  def build_guide_metadata(path)
    meta = { title: nil, description: nil, priority: nil, unlisted: false }
    in_table = false
    File.foreach(path) do |raw|
      line = raw.rstrip
      break if in_table && !(line.start_with?("|") || line.strip.empty?)
      next if !in_table && line.strip.empty?

      if line.start_with?("|")
        in_table = true
        cells = line.split("|")
        cells.shift if cells.first&.strip == ""
        cells.pop   if cells.last&.strip == ""
        cells = cells.map { |c| c.strip }

        next if cells.all? { |c| c.match?(/\A:?-{3,}:?\z/) }

        if cells.length >= 2
          key = cells[0].to_s.downcase
          val = cells[1].to_s
          case key
          when "title", "description"
            meta[key.to_sym] = val
          when "priority"
            meta[:priority] = Integer(val) rescue nil
          when "unlisted"
            meta[:unlisted] = val.to_s.downcase == "true"
          end
        end
      else
        break
      end
    end
    meta
  rescue Errno::ENOENT
    { title: nil, description: nil, priority: nil, unlisted: false }
  end
end
