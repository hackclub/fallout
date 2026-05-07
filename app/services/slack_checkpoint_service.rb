# Verifies that a reviewer has posted a checkpoint message in the #fallout-checkpoint
# Slack channel mentioning the project owner within the past 24 hours.
# Returns the permalink of the matching message, or nil if none is found.
class SlackCheckpointService
  CHANNEL_ID = "C0ATLF0ALBW"
  MAX_TASK_TEXT_CHARS = 120

  REVIEW_LABELS = {
    "time_audit"          => "Time Audit",
    "requirements_check"  => "Requirements Check",
    "design_review"       => "Design Review",
    "build_review"        => "Build Review"
  }.freeze

  # Checks the channel history for a message in the past 24 hours that mentions
  # the given slack_id. Returns the message permalink on success, nil otherwise.
  def self.find_checkpoint_message(slack_id)
    return nil if slack_id.blank?

    client = Slack::Web::Client.new(token: ENV.fetch("SLACK_BOT_TOKEN", nil))
    oldest = 24.hours.ago.to_i.to_s

    response = client.conversations_history(
      channel: CHANNEL_ID,
      oldest: oldest,
      limit: 200
    )

    mention = "<@#{slack_id}>"
    message = response.messages.find { |m| m.text.to_s.include?(mention) }
    return nil unless message

    permalink_response = client.chat_getPermalink(
      channel: CHANNEL_ID,
      message_ts: message.ts
    )
    permalink_response.permalink
  rescue Slack::Web::Api::Errors::SlackError, Faraday::Error => e
    Rails.logger.warn("SlackCheckpointService.find_checkpoint_message failed: #{e.class}: #{e.message}")
    nil
  end

  # Verifies a provided permalink actually exists in the channel and mentions
  # the expected slack_id. Returns :ok, :not_found, or :wrong_mention.
  def self.verify_permalink(permalink, slack_id)
    return :not_found if permalink.blank? || slack_id.blank?

    ts = extract_ts(permalink)
    return :not_found unless ts

    client = Slack::Web::Client.new(token: ENV.fetch("SLACK_BOT_TOKEN", nil))
    response = client.conversations_history(
      channel: CHANNEL_ID,
      latest: ts,
      oldest: (ts.to_f - 1).to_s,
      inclusive: true,
      limit: 1
    )

    message = response.messages.first
    return :not_found unless message

    message.text.to_s.include?("<@#{slack_id}>") ? :ok : :wrong_mention
  rescue Slack::Web::Api::Errors::SlackError, Faraday::Error
    :not_found
  end

  # Posts a thread reply on the checkpoint message summarising the review outcome.
  # Only two blocks are sent: a plan block (timeline) and a card block (project info).
  # Tasks with pending/in_progress status are omitted — only complete and error are shown.
  #
  # message_ts      - Slack ts of the checkpoint message to reply to
  # ship            - Ship record (with reviews and their versions preloaded)
  # review_type     - "requirements_check" or "design_review"
  # review_status   - the terminal status just applied (unused directly; read from record)
  # cover_image_url - absolute URL for the project cover image, or nil
  # project_url     - absolute URL to the project page
  # repo_url        - project repo link, or nil
  # base_url        - app host for blob URLs
  def self.post_review_thread(message_ts:, ship:, review_type:, review_status:, cover_image_url:, project_url:, repo_url:, base_url:) # rubocop:disable Metrics/ParameterLists
    return if message_ts.blank?

    client = Slack::Web::Client.new(token: ENV.fetch("SLACK_BOT_TOKEN", nil))
    project = ship.project
    review_label = REVIEW_LABELS.fetch(review_type, review_type)

    tasks = build_plan_tasks(ship, review_type)

    icon_url = SlackAvatarService.card_icon_url(avatar_url: project.user.avatar, base_url: base_url)
    card_block = SlackProjectCardService.build_card_block(
      project: project,
      project_url: project_url,
      repo_url: repo_url,
      cover_image_url: cover_image_url,
      icon_url: icon_url
    )

    plan_status = tasks.any? { |t| t[:status] == "error" } ? "error" : "complete"

    limit = nil

    loop do
      blocks = [
        {
          type: "plan",
          plan_id: "plan_#{ship.id}_#{review_type}",
          title: review_label,
          status: plan_status,
          tasks: truncate_tasks_for_slack(tasks, limit)
        },
        card_block
      ]

      begin
        return client.chat_postMessage(
          channel: CHANNEL_ID,
          thread_ts: message_ts,
          text: "#{project.name} — #{review_label} review submitted",
          blocks: blocks.to_json
        )
      rescue Slack::Web::Api::Errors::InvalidBlocks
        next_limit = next_task_truncate_limit(limit)
        break if next_limit.nil?

        limit = next_limit
      end
    end

    nil
  rescue Slack::Web::Api::Errors::SlackError, Faraday::Error
    nil
  end

  # Extracts the Slack message ts from a permalink URL.
  # Slack permalinks encode the timestamp as the last path segment,
  # e.g. https://hackclub.enterprise.slack.com/archives/C.../p1234567890123456
  # The "p"-prefixed number maps to a message ts like "1234567890.123456".
  def self.extract_ts(permalink)
    return nil if permalink.blank?

    match = permalink.match(%r{/p(\d{10})(\d{6})$})
    return nil unless match

    "#{match[1]}.#{match[2]}"
  end

  # Builds the ordered list of plan tasks. Only complete and error statuses are
  # included — pending/in_progress tasks are omitted entirely.
  def self.build_plan_tasks(ship, review_type)
    tasks = []
    project = ship.project

    past_ships = project.ships
      .where(status: [ :returned, :rejected ])
      .where.not(id: ship.id)
      .order(:created_at)
      .includes(:requirements_check_review, :design_review)

    # Collect prior feedback for the current review type to attach as output
    # on the current attempt's task rather than as separate standalone tasks.
    prior_feedbacks = past_ships.filter_map do |past_ship|
      past_review = case review_type
      when "requirements_check" then past_ship.requirements_check_review
      when "design_review"      then past_ship.design_review
      end
      next if past_review.nil?

      past_review.feedback.to_s.presence || past_review.status.to_s.capitalize
    end

    attempt_num = past_ships.size + 1
    current_label = past_ships.any? ? "#{REVIEW_LABELS[review_type]} (attempt #{attempt_num})" : nil
    prior_output = prior_feedbacks.present? ? prior_feedbacks.map { |f| ":no-no: #{f}" }.join("\n") : nil

    case review_type
    when "requirements_check"
      tasks << review_task(ship.time_audit_review, "time_audit", prior_output: prior_output)
      tasks << review_task(ship.requirements_check_review, "requirements_check", label_override: current_label)
    when "design_review"
      tasks << review_task(ship.time_audit_review, "time_audit")
      tasks << review_task(ship.requirements_check_review, "requirements_check", prior_output: prior_output)
      tasks << review_task(ship.design_review, "design_review", label_override: current_label)
    end

    tasks.compact
  end
  private_class_method :build_plan_tasks

  def self.review_task(review, key, label_override: nil, prior_output: nil)
    return nil if review.nil?

    plan_status = case review.status.to_s
    when "approved" then "complete"
    when "returned", "rejected" then "error"
    else return nil # omit pending/unstarted stages
    end

    detail = review.feedback.to_s.presence || review.status.to_s.capitalize
    build_task(
      task_id: "#{key}_#{review.id}",
      title: label_override || REVIEW_LABELS[key],
      status: plan_status,
      detail: detail,
      prior_output: prior_output
    )
  end
  private_class_method :review_task

  def self.build_task(task_id:, title:, status:, detail:, prior_output: nil)
    task = {
      task_id: task_id,
      title: title,
      status: status,
      details: {
        type: "rich_text",
        elements: [ {
          type: "rich_text_section",
          elements: [ { type: "text", text: "\n#{detail}" } ]
        } ]
      }
    }

    if prior_output.present?
      task[:output] = {
        type: "rich_text",
        elements: [ {
          type: "rich_text_section",
          elements: [ { type: "text", text: prior_output } ]
        } ]
      }
    end

    task
  end
  private_class_method :build_task

  def self.truncate_tasks_for_slack(tasks, limit)
    return tasks if limit.nil?

    tasks.map do |task|
      shrunk = task.deep_dup

      detail_text = shrunk.dig(:details, :elements, 0, :elements, 0, :text)
      if detail_text
        shrunk[:details][:elements][0][:elements][0][:text] = detail_text.to_s.truncate(limit, omission: "...")
      end

      output_text = shrunk.dig(:output, :elements, 0, :elements, 0, :text)
      if output_text
        shrunk[:output][:elements][0][:elements][0][:text] = output_text.to_s.truncate(limit, omission: "...")
      end

      shrunk
    end
  end
  private_class_method :truncate_tasks_for_slack

  def self.next_task_truncate_limit(current_limit)
    current_limit.nil? ? MAX_TASK_TEXT_CHARS : nil
  end
  private_class_method :next_task_truncate_limit
end
