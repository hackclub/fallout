# frozen_string_literal: true

# Usage (production console):
#   BlueprintImporter.run!                                              # live import
#   BlueprintImporter.run!(dry_run: true)                               # preview only
#   BlueprintImporter.run!(only_link: "https://blueprint.hackclub.com/projects/123")
#
# Behaviour:
#   - Reads approved rows from the Blueprint transfer Airtable table.
#   - For each row: calls GET /api/unfinished_projects?email=X and finds the
#     matching project by ID extracted from the Blueprint link.
#   - Finds the Fallout user by email, then merges journal entries into an
#     existing same-named project or creates a new one. Adds overridden hours
#     to the project's manual_seconds.
#   - Deduplication: entries whose timestamp (to the minute) already exists on
#     the project are skipped, so re-running is safe.
class BlueprintImporter
  AIRTABLE_TABLE_ID = "tblOzctyz4JGHL24P"

  COL_EMAIL   = "Email"
  COL_BP_LINK = "Blueprint / Stasis Project Link"
  COL_STATUS  = "Status"
  COL_HOURS   = "OPTIONAL - Hours Override"

  def self.run!(dry_run: false, only_link: nil)
    puts "=== Blueprint Import#{' (DRY RUN)' if dry_run} ==="

    rows     = fetch_airtable_rows
    approved = rows.select { |r| r.dig("fields", COL_STATUS)&.strip&.casecmp?("approved") }
    approved = approved.select { |r| r.dig("fields", COL_BP_LINK)&.strip == only_link } if only_link
    puts "Airtable: #{rows.size} rows total, #{approved.size} approved#{" (filtered to #{only_link})" if only_link}\n\n"

    stats         = Hash.new(0)
    no_user_links = []
    transferred   = Hash.new { |h, k| h[k] = [] }

    approved.each do |row|
      fields         = row["fields"]
      email          = fields[COL_EMAIL]&.strip
      bp_link        = fields[COL_BP_LINK]&.strip
      hours_override = fields[COL_HOURS]&.to_f

      unless email.present? && bp_link.present?
        puts "SKIP (missing email/link): row #{row['id']}"
        stats[:skipped] += 1
        next
      end

      bp_id = extract_bp_id(bp_link)
      unless bp_id
        puts "SKIP (can't parse project ID from): #{bp_link}"
        stats[:skipped] += 1
        next
      end

      user = User.verified.find_by(email: email)
      unless user
        puts "SKIP (no Fallout user for): #{email}"
        no_user_links << bp_link
        stats[:skipped] += 1
        next
      end

      begin
        raw_projects = BlueprintService.fetch_unfinished_projects(email)
        raw_project  = raw_projects.find { |p| p["id"].to_i == bp_id }

        unless raw_project&.fetch("name", nil).present?
          puts "SKIP (bp##{bp_id} not found in unfinished projects for #{email}): #{bp_link}"
          stats[:skipped] += 1
          next
        end

        bp_project = {
          bp_id:           bp_id,
          name:            raw_project["name"],
          description:     raw_project["description"],
          repo_link:       raw_project["repo_url"],
          demo_link:       raw_project["demo_url"],
          journal_entries: (raw_project["journal_entries"] || []).map do |e|
            { timestamp: e["date"], content: e["content"] }
          end
        }

        project_name = import_project(user, bp_project, hours_override, dry_run, stats)
        transferred[user] << project_name if project_name
      rescue => e
        puts "ERROR #{email} / bp##{bp_id}: #{e.class} — #{e.message}"
        stats[:errors] += 1
      end
    end

    unless dry_run
      transferred.each do |user, names|
        MailDeliveryService.blueprint_transfer(user, names)
        puts "  + transfer mail sent to #{user.email} (#{names.join(', ')})"
      end
    end

    puts "\n=== Done: created=#{stats[:created]} merged=#{stats[:merged]} " \
         "entries=#{stats[:entries_added]} skipped=#{stats[:skipped]} errors=#{stats[:errors]} ==="

    if no_user_links.any?
      puts "\nNo Fallout user found for these Blueprint project links:"
      no_user_links.each { |link| puts "  #{link}" }
    end

    stats
  end

  private_class_method def self.import_project(user, bp_project, hours_override, dry_run, stats)
    existing = user.projects.kept.find_by("LOWER(name) = ?", bp_project[:name].downcase)

    if existing
      puts "  MERGE '#{bp_project[:name]}' into project##{existing.id} (#{user.email})"
      project = existing
      stats[:merged] += 1
    else
      print "  No match for '#{bp_project[:name]}' (#{user.email}). Project ID to merge into, or N to create new: "
      input = $stdin.gets&.strip

      if input.nil? || input.casecmp?("n")
        puts "  -> CREATE new project"
        stats[:created] += 1
        return if dry_run

        project = user.projects.create!(
          name:        bp_project[:name],
          description: bp_project[:description],
          repo_link:   valid_url?(bp_project[:repo_link]) ? bp_project[:repo_link] : nil,
          demo_link:   valid_url?(bp_project[:demo_link]) ? bp_project[:demo_link] : nil
        )
      else
        project = user.projects.kept.find_by(id: input.to_i)
        unless project
          puts "  SKIP (project ##{input} not found for #{user.email})"
          stats[:skipped] += 1
          return
        end
        puts "  -> MERGE into project##{project.id} '#{project.name}'"
        stats[:merged] += 1
      end
    end

    return if dry_run

    already_transferred = project.journal_entries.where("content LIKE ?", "Project transferred from Blueprint!%").exists?

    bp_project[:journal_entries].each do |entry_data|
      next unless entry_data[:timestamp].present?

      ts = entry_data[:timestamp].to_time.utc

      if project.journal_entries.exists?(created_at: ts.beginning_of_minute..ts.end_of_minute)
        puts "    SKIP entry (already exists at #{ts})"
        next
      end

      content = entry_data[:content]
      next if content.blank?

      je = JournalEntry.create!(user: user, project: project, content: content)
      je.update_columns(created_at: ts, updated_at: ts)
      MeilisearchReindexJob.perform_later(je.class.name, je.id)

      stats[:entries_added] += 1
      puts "    + entry #{ts}"
    end

    if already_transferred
      puts "    SKIP transfer markers (already transferred — re-run)"
      return nil
    end

    if hours_override&.positive?
      secs = (hours_override * 3600).round
      project.increment!(:manual_seconds, secs)
      puts "    + #{hours_override}h added to manual time"
    end

    transfer_content = if hours_override&.positive?
      "Project transferred from Blueprint! Duration Transferred: #{hours_override}h"
    else
      "Project transferred from Blueprint!"
    end
    JournalEntry.create!(user: user, project: project, content: transfer_content)
    puts "    + transfer journal entry added"

    project.name
  end

  private_class_method def self.fetch_airtable_rows
    base   = ENV.fetch("AIRTABLE_BASE_ID")
    key    = ENV.fetch("AIRTABLE_API_KEY")
    rows   = []
    offset = nil

    loop do
      params = { pageSize: 100 }
      params[:offset] = offset if offset

      res = Faraday.get("https://api.airtable.com/v0/#{base}/#{AIRTABLE_TABLE_ID}") do |req|
        req.headers["Authorization"] = "Bearer #{key}"
        req.params.merge!(params)
      end
      raise "Airtable #{res.status}: #{res.body.truncate(300)}" unless res.success?

      data = JSON.parse(res.body)
      rows.concat(data["records"] || [])
      offset = data["offset"]
      break unless offset
    end

    rows
  end

  private_class_method def self.extract_bp_id(url)
    URI.parse(url).path.match(/\/(\d+)\/?$/)&.[](1)&.to_i
  rescue URI::InvalidURIError
    nil
  end

  private_class_method def self.valid_url?(url)
    url.present? && url.match?(/\Ahttps?:\/\/\S+\z/i)
  end
end
