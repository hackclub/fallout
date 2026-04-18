# Sends a one-time Slack DM to users who have projects with no journal entries in the past 2 weeks.
# Sends one DM per user listing all inactive projects. Never re-notifies the same project.
class ProjectInactivityJob < ApplicationJob
  queue_as :background

  INACTIVITY_THRESHOLD = 2.weeks

  def perform
    User.verified.kept.where.not(slack_id: nil).find_each do |user|
      inactive_projects = user.projects.kept.select do |project|
        next false if project.inactivity_dm_sent_at.present? # Already notified, never repeat

        last_entry_at = project.journal_entries.kept.maximum(:created_at)
        cutoff = last_entry_at || project.created_at # No entries at all → use project creation date

        cutoff < INACTIVITY_THRESHOLD.ago
      end

      next if inactive_projects.empty?

      send_messages(user.slack_id, inactive_projects)

      Project.where(id: inactive_projects.map(&:id)).update_all(inactivity_dm_sent_at: Time.current)

      sleep 1 # Space out per-user batches
    end
  end

  private

  def send_messages(slack_id, projects)
    message_parts = []

    if projects.one?
      message_parts << ":oi: hey! looks like #{projects.first.name.downcase} hasn't had any journal entries in a while"
    else
      names = projects.map { |p| p.name.downcase }.join(", ")
      message_parts << ":oi: hey! looks like a few of your projects haven't had any journal entries in a while: #{names}"
    end

    message_parts << "not sure where to start? we've got docs that walk you through the whole process from zero to shipped (we put a LOT of time on it - they're really helpful!!): https://fallout.hackclub.com/docs"
    message_parts << "ALSO! if you have any questions you should ask in <#C037157AL30>! the community is super helpful :))"
    message_parts << "hardware is more approachable than it seems. jump back in whenever you're ready! (i'm so hungry)"

    SlackMsgJob.perform_later(slack_id, message_parts.join("\n"))
  end
end
