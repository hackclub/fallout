# frozen_string_literal: true

class Projects::ShipsController < ApplicationController
  # No index action — blanket skip required (Rails 8.1 callback validation)
  skip_after_action :verify_authorized
  skip_after_action :verify_policy_scoped

  before_action :set_project

  def preflight
    authorize @project, :ship?
    render inertia: "projects/ships/preflight", props: {
      project: { id: @project.id, name: @project.name }
    }
  end

  # POST /projects/:project_id/ships/preflight/run — kicks off preflight scan
  def run
    authorize @project, :ship?

    # Cancel any existing running PreflightRun for this project to prevent job spam
    @project.preflight_runs.running.update_all(status: :failed)

    preflight_run = @project.preflight_runs.create!(status: :running)

    initial_checks = ShipCheckService::USER_CHECKS.map do |c|
      { key: c[:key].to_s, label: c[:label], status: "running", message: nil }
    end
    # Seed cache for fast polling before the job starts writing results
    Rails.cache.write(
      "ship_preflight:#{preflight_run.id}",
      { status: "running", checks: initial_checks },
      expires_in: 5.minutes
    )

    ShipPreflightJob.perform_later(preflight_run.id)

    render json: { run_id: preflight_run.id, checks: initial_checks }
  end

  # GET /projects/:project_id/ships/preflight/status — polled by frontend
  def status
    authorize @project, :ship?

    preflight_run = @project.preflight_runs.find(params[:run_id]) # Scoped to project — prevents cross-project access

    # Fast path: read from cache during active run
    cached = Rails.cache.read("ship_preflight:#{preflight_run.id}")

    if cached
      checks = cached[:checks]
    else
      # Cache expired — fall back to DB record
      checks = preflight_run.checks || []
    end

    # Never expose internal checks to end users
    checks = checks.reject { |c| c[:visibility].to_s == "internal" || c["visibility"].to_s == "internal" }

    # Derive status from user checks — internal checks may still be running after all user checks finish
    status = if checks.any? { |c| c[:status].to_s == "running" || c["status"].to_s == "running" }
               "running"
    elsif checks.any? { |c| c[:status].to_s == "failed" || c["status"].to_s == "failed" }
               "failed"
    else
               "passed"
    end

    render json: { status: status, checks: checks }
  end

  def create
    authorize @project, :ship?

    preflight_run = @project.preflight_runs.find(params[:run_id]) # Scoped to project — prevents cross-project access

    # Read checks from cache (job may still be running internal checks) or DB
    cached = Rails.cache.read("ship_preflight:#{preflight_run.id}")
    all_checks = cached ? cached[:checks] : (preflight_run.checks || [])

    # Only user-facing checks gate submission — internal checks may still be running
    user_checks = all_checks.reject { |c| c[:visibility].to_s == "internal" || c["visibility"].to_s == "internal" }

    if user_checks.empty? || user_checks.any? { |c| %w[running failed].include?(c[:status].to_s) || %w[running failed].include?(c["status"].to_s) }
      render json: { error: "You cannot submit with failed checks." }, status: :unprocessable_entity
      return
    end

    # Snapshot current results — cache has the most up-to-date checks during a run
    snapshot = cached ? cached[:checks] : (preflight_run.all_results || [])

    # Hold submissions out of the reviewer queue until the user is HCA-verified with an address.
    # They still get to "ship" in the UX sense; HcaIdentityRefreshJob promotes to :pending once gated.
    initial_status = current_user.fully_identity_gated? ? :pending : :awaiting_identity

    ship = @project.ships.build(
      preflight_run: preflight_run,
      frozen_demo_link: @project.demo_link,
      frozen_repo_link: @project.repo_link,
      preflight_results: snapshot,
      status: initial_status
    )

    if ship.save
      render json: { submitted: true, awaiting_identity: ship.awaiting_identity? }
    else
      render json: { errors: ship.errors.messages }, status: :unprocessable_entity
    end
  end

  private

  def set_project
    @project = Project.kept.find(params[:project_id])
  end
end
