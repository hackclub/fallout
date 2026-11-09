# Project creation moved from :disable_new_submissions to its own :disable_new_projects flag.
# Copy the current gate state so deploying the split doesn't reopen project creation.
class CopyNewSubmissionsFlagsToNewProjects < ActiveRecord::Migration[8.1]
  def up
    copy_gates(:disable_new_submissions, :disable_new_projects)
    copy_gates(:new_submissions_override, :new_projects_override)
  end

  def down
    # Gate state is left as-is; flags are managed in /flipper.
  end

  private

  def copy_gates(from, to)
    values = Flipper.feature(from).gate_values
    target = Flipper.feature(to)

    target.enable if values.boolean
    values.actors.each { |flipper_id| target.enable_actor(Flipper::Actor.new(flipper_id)) }
    values.groups.each { |group| target.enable_group(group) }
    target.enable_percentage_of_actors(values.percentage_of_actors) if values.percentage_of_actors.to_f.positive?
    target.enable_percentage_of_time(values.percentage_of_time) if values.percentage_of_time.to_f.positive?
  end
end
