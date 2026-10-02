# Turns reviewer-typed DR/BR feedback into two renderings: the stored, user-facing feedback
# text and the Slack mrkdwn posted to #fallout-checkpoint as the reviewer.
#
# Tokens (mirrored by app/frontend/lib/reviewFeedbackTokens.ts — keep the two in sync):
#   @user          → the project owner
#   @Display Name  → the project owner, a collaborator, or any explicitly mentioned user
#   /proj/         → the project name, linked to its repo on Slack
class ReviewFeedbackFormatter
  OWNER_ALIAS = "user"
  PROJECT_TOKEN = "/proj/"
  MAX_MENTIONS = 20
  SLACK_ESCAPES = { "&" => "&amp;", "<" => "&lt;", ">" => "&gt;" }.freeze

  Result = Data.define(:feedback, :slack_text)

  def self.call(text:, project:, mention_ids: [])
    new(text:, project:, mention_ids:).call
  end

  def initialize(text:, project:, mention_ids:)
    @text = text.to_s
    @project = project
    @mention_ids = Array(mention_ids).first(MAX_MENTIONS)
  end

  def call
    return Result.new(feedback: @text.presence, slack_text: nil) if @text.blank?

    Result.new(feedback: render_feedback, slack_text: render_slack)
  end

  private

  def owner
    @project.user
  end

  # Keys are downcased display names; the owner is inserted first so a namesake never shadows them.
  def mentionable
    @mentionable ||= begin
      users = [ owner, *@project.collaborator_users ]
      users += User.verified.kept.where(id: @mention_ids).where.not(slack_id: nil).to_a if @mention_ids.any?
      map = { OWNER_ALIAS => owner }
      users.each { |u| map[u.display_name.downcase] ||= u if u.display_name.present? }
      map
    end
  end

  def pattern
    @pattern ||= begin
      names = mentionable.keys.sort_by { |n| -n.length }.map { |n| Regexp.escape(n) }
      /(#{Regexp.escape(PROJECT_TOKEN)})|(?<![\p{L}\p{N}_])@(#{names.join("|")})(?![\p{L}\p{N}_])|([&<>])/i
    end
  end

  def render_feedback
    @text.gsub(pattern) do
      if Regexp.last_match(1) then @project.name
      elsif Regexp.last_match(2) then "@#{mentionable[Regexp.last_match(2).downcase].display_name}"
      else Regexp.last_match(3)
      end
    end.strip
  end

  def render_slack
    owner_mentioned = false
    body = @text.gsub(pattern) do
      if Regexp.last_match(1)
        name = escape(@project.name)
        @project.repo_link.present? ? "<#{@project.repo_link}|#{name}>" : name
      elsif Regexp.last_match(2)
        user = mentionable[Regexp.last_match(2).downcase]
        owner_mentioned ||= user == owner
        user.slack_id.present? ? "<@#{user.normalized_slack_id}>" : escape("@#{user.display_name}")
      else
        SLACK_ESCAPES.fetch(Regexp.last_match(3))
      end
    end.strip

    # The checkpoint thread and later lookups key off the owner being tagged, so always include them.
    owner_mentioned || owner.slack_id.blank? ? body : "<@#{owner.normalized_slack_id}> #{body}"
  end

  def escape(str)
    str.to_s.gsub(/[&<>]/, SLACK_ESCAPES)
  end
end
