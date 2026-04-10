# Sends a one-time Slack DM to users who have projects with no journal entries in the past 2 weeks.
# Sends one DM per user listing all inactive projects. Never re-notifies the same project.
class ProjectInactivityJob < ApplicationJob
  queue_as :background

  INACTIVITY_THRESHOLD = 2.weeks

  def perform
    User.kept.where.not(type: "TrialUser").where.not(slack_id: nil).find_each do |user|
      inactive_projects = user.projects.kept.select do |project|
        next false if project.inactivity_dm_sent_at.present? # Already notified, never repeat

        last_entry_at = project.journal_entries.kept.maximum(:created_at)
        cutoff = last_entry_at || project.created_at # No entries at all → use project creation date

        cutoff < INACTIVITY_THRESHOLD.ago
      end

      next if inactive_projects.empty?

      send_messages(user.slack_id, inactive_projects)

      Project.where(id: inactive_projects.map(&:id)).update_all(inactivity_dm_sent_at: Time.current)
    end
  end

  private

  def send_messages(slack_id, projects)
    if projects.one?
      project_line = "*#{projects.first.name}*"
      SlackMsgJob.perform_later(slack_id, ":oi: hey! looks like #{project_line} hasn't had any journal entries in a while")
    else
      names = projects.map { |p| "*#{p.name}*" }.join(", ")
      SlackMsgJob.perform_later(slack_id, ":oi: hey! looks like a few of your projects haven't had any journal entries in a while: #{names}")
    end

    SlackMsgJob.perform_later(slack_id, "not sure where to start? we've got docs that walk you through the whole process from zero to shipped (we put a LOT of time on it - they're really helpful!!): https://fallout.hackclub.com/docs")
    SlackMsgJob.perform_later(slack_id, "hardware is more approachable than it seems. jump back in whenever you're ready! (i'm so hungry)")
  end
end
