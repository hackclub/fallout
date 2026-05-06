# frozen_string_literal: true

class BlueprintService
  def self.fetch_unfinished_projects(email)
    base_url = ENV.fetch("BLUEPRINT_API_URL", "https://blueprint.hackclub.com")
    res = Faraday.get("#{base_url}/api/unfinished_projects", { email: email }) do |req|
      req.headers["Authorization"] = "Bearer #{ENV.fetch('BLUEPRINT_API_KEY')}"
    end
    raise "Blueprint #{res.status} for /api/unfinished_projects: #{res.body.truncate(300)}" unless res.success?

    parse_markdown(res.body)
  end

  private_class_method def self.parse_markdown(markdown)
    projects = []

    markdown.split(/\n\n---\n\n/).each do |block|
      block = block.strip
      next if block.empty?

      header_match = block.match(/^## (.+?) \(ID: (\d+)\)/)
      next unless header_match

      desc_match = block.match(/^\*\*Description:\*\* (.+)/)

      journal_entries = []
      if (journal_section = block.split("### Journal Entries\n", 2)[1])
        journal_section.split(/(?=^# \d{1,2}\/\d{1,2}\/\d{4} )/m).each do |entry_block|
          entry_block = entry_block.strip
          next if entry_block.empty?

          date_match = entry_block.match(/^# (\d{1,2}\/\d{1,2}\/\d{4} \d{1,2}:\d{2} [AP]M)/)
          next unless date_match

          content = entry_block
            .sub(/^# .+\n/, "")
            .sub(/^_Time spent: .+_\n?/, "")
            .strip

          parsed_date = DateTime.strptime(date_match[1], "%m/%d/%Y %I:%M %p").utc.iso8601
          journal_entries << { "date" => parsed_date, "content" => content }
        end
      end

      projects << {
        "id"              => header_match[2].to_i,
        "name"            => header_match[1].strip,
        "description"     => desc_match&.[](1)&.strip,
        "repo_url"        => nil,
        "demo_url"        => nil,
        "journal_entries" => journal_entries
      }
    end

    projects
  end
end
