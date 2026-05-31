namespace :journal do
  desc "Import entries from a GitHub markdown file into an existing project. " \
       "Usage: MARKDOWN_URL=<url> PROJECT_ID=<id> USER_ID=<id> rails journal:import_github\n" \
       "Pass a GitHub blob URL (github.com/.../blob/...) or raw URL (raw.githubusercontent.com/...)"
  task import_github: :environment do
    require "open-uri"

    url        = ENV.fetch("MARKDOWN_URL") { raise "MARKDOWN_URL is required" }
    project_id = ENV.fetch("PROJECT_ID")   { raise "PROJECT_ID is required" }.to_i
    user_id    = ENV.fetch("USER_ID")      { raise "USER_ID is required" }.to_i

    # Convert GitHub blob URLs to raw content URLs automatically
    url = url.gsub(%r{github\.com/([^/]+/[^/]+)/blob/}, "raw.githubusercontent.com/\\1/")

    project = Project.kept.find(project_id)
    user    = User.kept.find(user_id)
    raise "User ##{user_id} must own or collaborate on project ##{project_id}" unless project.owner_or_collaborator?(user)

    raise "MARKDOWN_URL must be an https:// URL" unless url.start_with?("https://")

    puts "Fetching #{url}..."
    markdown = URI.open(url, "Accept" => "text/plain").read.force_encoding("UTF-8") # rubocop:disable Security/Open

    # Split on top-level headings — each becomes one journal entry
    sections = markdown.split(/^(?=# )/).map(&:strip).reject(&:blank?)
    puts "Found #{sections.size} top-level sections in #{project.name}. Importing..."

    imported = 0
    ActiveRecord::Base.transaction do
      sections.each_with_index do |section, i|
        lines   = section.lines
        heading = lines.first.to_s.strip

        # Parse "# 5/18/2026 8pm - Title" or "# 5/18/2026 2:30pm - Title"
        m = heading.match(/^#\s+(\d+)\/(\d+)\/(\d{4})\s+(\d+)(?::(\d+))?\s*(am|pm)/i)
        unless m
          puts "  [#{i + 1}] Skipped — no parseable date in: #{heading[0..80]}"
          next
        end

        month, day, year, hour, min, meridian = m.captures
        hour = hour.to_i
        hour += 12 if meridian.casecmp("pm").zero? && hour != 12
        hour  = 0  if meridian.casecmp("am").zero? && hour == 12
        entry_time = Time.utc(year.to_i, month.to_i, day.to_i, hour, min.to_i)

        # Drop the heading line; convert <img src="..."> tags to markdown image syntax
        # so they render inline (escape_html: true in the renderer blocks raw HTML).
        # github.com is in ALLOWED_IMAGE_HOSTS so no re-upload is needed.
        content = lines[1..].join
        content = content.gsub(/<img\b[^>]*>/i) do |tag|
          src = tag[/\bsrc="([^"]+)"/, 1]
          alt = tag[/\balt="([^"]+)"/, 1] || ""
          src ? "\n![#{alt}](#{src})\n" : ""
        end
        content = content.strip

        entry = project.journal_entries.new(user: user, content: content)
        entry.save!
        # Bypass the auto-timestamping to preserve the original journal date
        entry.update_columns(created_at: entry_time, updated_at: entry_time)
        imported += 1
        puts "  [#{i + 1}] Created entry ##{entry.id} — #{heading[2..70].strip}"
      end
    end

    puts "Done. Imported #{imported} of #{sections.size} sections."
  end
end
