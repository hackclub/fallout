require "zip"
require "open3"

class Admin::Reviews::RequirementsChecksController < Admin::Reviews::BaseController
  def index
    base = policy_scope(RequirementsCheckReview)
      .includes(ship: [ :project, project: :user ], reviewer: [])

    pending_reviews = base.pending.where.not(ship_id: flagged_ship_ids).order(created_at: :asc).load
    @pagy, @all_reviews = pagy(base.order(created_at: :desc))
    flagged_ids = ProjectFlag.distinct.pluck(:project_id).to_set

    render inertia: {
      pending_reviews: pending_reviews.map { |r| serialize_review_row(r) },
      all_reviews: @all_reviews.map { |r| serialize_review_row(r, flagged_project_ids: flagged_ids) },
      pagy: pagy_props(@pagy),
      start_reviewing_path: next_admin_reviews_requirements_checks_path
    }
  end

  def show
    authorize @review

    ship = @review.ship
    project = ship.project
    time_audit = ship.time_audit_review

    new_entries = ship.new_journal_entries
      .includes(:user, :images_attachments, recordings: :recordable)
      .order(created_at: :asc)

    previous_entries = ship.previous_journal_entries
      .includes(:user, :images_attachments, recordings: :recordable)
      .order(created_at: :asc)

    render inertia: {
      review: serialize_review_detail(@review),
      project: serialize_project_context(project, ship),
      new_entries: new_entries.map { |je| serialize_journal_entry(je, time_audit) },
      previous_entries: previous_entries.map { |je| serialize_journal_entry(je, time_audit) },
      sibling_statuses: serialize_sibling_statuses(ship),
      repo_tree: @review.repo_tree,
      refresh_tree_path: refresh_tree_admin_reviews_requirements_check_path(@review),
      gerber_zip_files_path: gerber_zip_files_admin_reviews_requirements_check_path(@review),
      reviewer_notes: InertiaRails.defer { serialize_reviewer_notes(project) },
      reviewer_notes_path: admin_project_reviewer_notes_path(project),
      project_flagged: project.flagged?,
      can: { update: policy(@review).update? },
      skip: params[:skip],
      heartbeat_path: heartbeat_admin_reviews_requirements_check_path(@review),
      next_path: next_admin_reviews_requirements_checks_path,
      index_path: admin_reviews_requirements_checks_path
    }
  end

  def refresh_tree
    @review = RequirementsCheckReview.find(params[:id])
    authorize @review, :update?
    FetchRepoTreeJob.perform_later(@review.id)
    render json: { ok: true }
  end

  def gerber_zip_files
    @review = RequirementsCheckReview.find(params[:id])
    authorize @review, :update?

    zip_path = params[:path].to_s
    unless zip_path.end_with?(".zip")
      return render json: { error: "Not a zip file" }, status: :unprocessable_entity
    end

    project = @review.ship.project
    match = project.repo_link.to_s.match(%r{github\.com/([^/]+)/([^/]+?)(?:\.git)?$})
    unless match
      return render json: { error: "Could not parse repo URL" }, status: :unprocessable_entity
    end

    owner, repo = match[1], match[2]
    branch = @review.repo_tree&.dig("default_branch") || "main"

    # Fetch file metadata via the GitHub contents API (returns JSON with base64 content or download_url)
    meta_response = GithubService.connection.get("/gh/repos/#{owner}/#{repo}/contents/#{zip_path}") do |req|
      req.params["ref"] = branch
    end

    unless meta_response.status == 200
      return render json: { error: "Could not fetch zip from GitHub" }, status: :bad_gateway
    end

    meta = JSON.parse(meta_response.body)

    # Prefer base64-encoded content inline; fall back to download_url for large files
    zip_binary = if meta["encoding"] == "base64" && meta["content"].present?
      Base64.decode64(meta["content"])
    elsif meta["download_url"].present?
      dl = Faraday.get(meta["download_url"])
      raise "Download failed (#{dl.status})" unless dl.status == 200
      dl.body
    else
      return render json: { error: "No downloadable content found" }, status: :bad_gateway
    end

    gerber_extensions = %w[gbr gtl gbl gts gbs gto gbo gko gm1 drl exc xln]
    node_script = Rails.root.join("lib/gerber_to_svg.cjs").to_s
    files = []

    Tempfile.create([ "gerber", ".zip" ], binmode: true) do |tmp|
      tmp.write(zip_binary)
      tmp.flush

      Zip::File.open(tmp.path) do |zip|
        zip.each do |entry|
          next unless entry.file?
          ext = File.extname(entry.name).delete_prefix(".").downcase
          next unless gerber_extensions.include?(ext)
          files << { name: File.basename(entry.name), content: entry.get_input_stream.read.force_encoding("UTF-8") }
        end
      end
    end

    return render json: { error: "No Gerber files found in zip" }, status: :unprocessable_entity if files.empty?

    # Render top+bottom board SVGs via pcb-stackup in Node
    stdout, stderr, status = Open3.capture3("node #{node_script}", stdin_data: files.to_json)
    unless status.success?
      return render json: { error: "Render failed: #{stderr.truncate(200)}" }, status: :internal_server_error
    end

    render json: JSON.parse(stdout)
  rescue => e
    render json: { error: e.message }, status: :internal_server_error
  end

  def update
    authorize @review

    if @review.update(review_params)
      if @review.approved? || @review.returned? || @review.rejected?
        redirect_to_next_or_index(notice: "Requirements check #{@review.status}.")
      else
        redirect_to admin_reviews_requirements_check_path(@review, skip: params[:skip]), notice: "Requirements check updated."
      end
    else
      redirect_back fallback_location: admin_reviews_requirements_check_path(@review),
                    inertia: { errors: @review.errors.messages }
    end
  end

  private

  def review_model
    RequirementsCheckReview
  end

  def review_params
    params.expect(requirements_check_review: [ :status, :feedback, :internal_reason ])
  end

  def serialize_review_detail(review)
    ship = review.ship
    {
      id: review.id,
      ship_id: ship.id,
      status: review.status,
      feedback: review.feedback,
      internal_reason: review.internal_reason,
      reviewer_display_name: review.reviewer&.display_name,
      project_name: ship.project.name,
      user_display_name: ship.project.user.display_name,
      preflight_results: ship.preflight_results,
      created_at: review.created_at.strftime("%B %d, %Y")
    }
  end
end
