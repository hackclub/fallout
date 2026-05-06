class Admin::Reviews::BaseController < Admin::ApplicationController
  # No index action on base — override verify_authorized/verify_policy_scoped to avoid ActionNotFound
  skip_after_action :verify_authorized
  skip_after_action :verify_policy_scoped

  before_action :set_review, only: %i[ show update heartbeat ]
  before_action :release_all_review_claims, only: %i[ index ]
  before_action :claim_review!, only: %i[ show ]
  before_action :extend_review_claim!, only: %i[ update ]

  # -- Shared actions (heartbeat + next) --

  def heartbeat
    authorize @review, :heartbeat?

    if @review.claimed_by?(current_user)
      @review.extend_claim!
      render json: { ok: true, expires_at: @review.claim_expires_at.iso8601 }
    else
      render json: { error: "claim_lost" }, status: :conflict
    end
  end

  # GET /admin/reviews/:type/next?skip=1,2,3
  # Finds the next eligible review and redirects to its show page.
  def next
    skip_authorization # Collection action — no record to authorize
    skip_ids = parse_skip_ids
    review = review_model.next_eligible(current_user, skip_ids:)

    if review
      redirect_to review_show_path(review, skip: skip_ids.any? ? skip_ids.join(",") : nil)
    else
      redirect_to review_index_path, notice: "No more pending reviews."
    end
  end

  private

  def review_model
    raise NotImplementedError
  end

  def set_review
    @review = review_model.find(params[:id])
  end

  # -- Claim lifecycle --

  def release_all_review_claims
    had_claim = any_active_claim?
    Reviewable::REVIEW_MODELS.each { |name| name.constantize.release_all_claims!(current_user) }
    flash.now[:notice] = "Review session ended." if had_claim
  end

  def claim_review!
    had_claim = any_active_claim?

    # Release any existing claim by this user (one claim at a time across all types)
    Reviewable::REVIEW_MODELS.each { |name| name.constantize.release_all_claims!(current_user) }

    claimed = review_model.atomic_claim!(@review.id, current_user)

    if claimed
      # Only flash "session started" on fresh entry (no skip param = not mid-session)
      flash[:notice] = "Review session started." if !had_claim && params[:skip].blank?
    elsif current_user.admin?
      nil # Admins can view without claiming (supervisory mode)
    elsif !@review.pending?
      redirect_to review_index_path, notice: "This review has already been #{@review.status}."
    else
      # Claimed by someone else — auto-advance to next available
      skip_ids = parse_skip_ids << @review.id
      redirect_to review_next_path(skip: skip_ids.join(",")),
                  alert: "This review is being reviewed by #{@review.reviewer&.display_name}. Finding next..."
    end
  end

  def extend_review_claim!
    @review.extend_claim! if @review.claimed_by?(current_user)
  end

  # -- Helpers --

  def any_active_claim?
    Reviewable::REVIEW_MODELS.any? { |name| name.constantize.active_claim_for(current_user).present? }
  end

  def parse_skip_ids
    (params[:skip] || "").split(",").filter_map { |id| id.to_i if id.present? }
  end

  # Flagged projects are visible in the All table but excluded from the pending queue
  def flagged_ship_ids
    Ship.where(project_id: ProjectFlag.select(:project_id)).select(:id)
  end

  def redirect_to_next_or_index(notice:)
    @review.update_columns(claim_expires_at: nil) # Clear claim expiry but keep reviewer_id as audit trail
    clear_flag_if_admin_override!
    skip_ids = parse_skip_ids << @review.id
    redirect_to review_next_path(skip: skip_ids.join(",")), notice: notice
  end

  # Admin submitting a decision on a flagged review clears the flag (admin override)
  def clear_flag_if_admin_override!
    return unless current_user.admin?
    project = @review.ship.project
    project.project_flags.destroy_all if project.flagged?
  end

  # -- Route helpers — use url_for with controller/action instead of polymorphic_path,
  # because resource names (time_audits) don't match model names (TimeAuditReview). --

  def review_show_path(review, **opts)
    url_for(controller: params[:controller], action: :show, id: review.id, only_path: true, **opts)
  end

  def review_index_path
    url_for(controller: params[:controller], action: :index, only_path: true)
  end

  def review_next_path(**opts)
    url_for(controller: params[:controller], action: :next, only_path: true, **opts)
  end

  def serialize_reviewer_notes(project)
    project.reviewer_notes.includes(:user).order(created_at: :desc).map do |note|
      {
        id: note.id,
        body: note.body,
        ship_id: note.ship_id,
        review_stage: note.review_stage,
        author_display_name: note.user.display_name,
        author_avatar: note.user.avatar,
        author_id: note.user_id,
        created_at: note.created_at.iso8601,
        updated_at: note.updated_at.iso8601
      }
    end
  end

  def serialize_review_row(review, flagged_project_ids: Set.new)
    ship = review.ship
    sibling = review.is_a?(TimeAuditReview) ? ship.requirements_check_review : ship.time_audit_review
    {
      id: review.id,
      ship_id: ship.id,
      project_name: ship.project.name,
      user_display_name: ship.project.user.display_name,
      status: review.status,
      project_flagged: flagged_project_ids.include?(ship.project_id),
      reviewer_display_name: review.reviewer&.display_name,
      created_at: review.created_at.strftime("%b %d, %Y"),
      is_claimed: review.claimed?,
      claimed_by_display_name: review.claimed? ? review.reviewer&.display_name : nil,
      sibling_approved: sibling&.approved? || false,
      requirements_check_reviewer_display_name: review.is_a?(DesignReview) ? ship.requirements_check_review&.reviewer&.display_name : nil
    }
  end

  def serialize_project_context(project, ship)
    logged = (project.time_logged / 3600.0).round(1)
    public_hrs = ship.approved_seconds ? (ship.approved_seconds / 3600.0).round(1) : nil
    internal_hrs = compute_internal_hours(ship)
    entry_count = project.kept_journal_entries.size
    first_ship = project.ships.order(:created_at).first
    {
      id: project.id,
      name: project.name,
      description: project.description,
      repo_link: project.repo_link,
      demo_link: project.demo_link,
      tags: project.tags,
      created_at: project.created_at.strftime("%b %d, %Y"),
      user_id: project.user_id,
      user_display_name: project.user.display_name,
      user_avatar: project.user.avatar,
      user_slack_id: project.user.slack_id, # Admin-only context; review pages are staff-only
      logged_hours: logged,
      approved_public_hours: public_hrs,
      approved_internal_hours: internal_hrs,
      entry_count: entry_count,
      ship_type: ship.ship_type,
      frozen_repo_link: ship.frozen_repo_link,
      frozen_demo_link: ship.frozen_demo_link,
      waiting_since: ship.created_at.iso8601,
      first_submitted_at: first_ship&.created_at&.iso8601
    }
  end

  def serialize_sibling_statuses(ship)
    {
      time_audit: ship.time_audit_review&.status,
      requirements_check: ship.requirements_check_review&.status,
      design_review: ship.design_review&.status,
      build_review: ship.build_review&.status
    }
  end

  def serialize_journal_entry(journal_entry, time_audit)
    annotations = time_audit&.annotations || {}
    recording_annotations = annotations["recordings"] || {}

    recordings_summary = journal_entry.recordings.map do |r|
      rec_id = r.id.to_s
      rec_data = recording_annotations[rec_id] || {}
      duration = recording_duration(r)
      segments = rec_data["segments"] || []
      # YouTube stretch_multiplier lets reviewers treat a YT video as a timelapse (e.g. ×60)
      multiplier = r.recordable.is_a?(YouTubeVideo) ? (rec_data["stretch_multiplier"]&.to_f || 1.0) : 60.0

      removed_seconds = segments.sum do |seg|
        video_range = seg["end_seconds"].to_f - seg["start_seconds"].to_f
        real_range = video_range * multiplier
        case seg["type"]
        when "removed" then real_range
        when "deflated" then real_range * (seg["deflated_percent"].to_f / 100)
        else 0
        end
      end

      {
        id: r.id,
        name: r.recordable.try(:name) || r.recordable.try(:title) || "Recording",
        type: r.recordable_type,
        duration: duration,
        description: rec_data["description"],
        removed_seconds: removed_seconds.round
      }
    end

    total_duration = journal_entry.recordings.sum { |r| recording_duration(r) }
    approved_duration = recordings_summary.sum { |r| [ 0, r[:duration] - r[:removed_seconds] ].max }

    {
      id: journal_entry.id,
      content_html: helpers.render_user_markdown(journal_entry.content.to_s),
      images: journal_entry.images.map { |img| url_for(img) },
      author_display_name: journal_entry.user.display_name,
      author_avatar: journal_entry.user.avatar,
      created_at: journal_entry.created_at.strftime("%b %d, %Y"),
      total_duration: total_duration,
      approved_duration: approved_duration,
      recordings: recordings_summary
    }
  end

  def recording_duration(recording)
    case recording.recordable
    when LookoutTimelapse, LapseTimelapse then recording.recordable.duration.to_i
    when YouTubeVideo then recording.recordable.duration_seconds.to_i * (recording.recordable.stretch_multiplier || 1)
    else 0
    end
  end

  def compute_internal_hours(ship)
    base = ship.approved_seconds || 0
    dr_adj = ship.design_review&.hours_adjustment || 0
    br_adj = ship.build_review&.hours_adjustment || 0
    total = base + dr_adj + br_adj
    return nil if base.zero? && dr_adj.zero? && br_adj.zero?
    (total / 3600.0).round(1)
  end

  # Resolves a verified checkpoint message URL for the project owner.
  # If a permalink is provided, it verifies it mentions the user. Otherwise,
  # it searches the channel history automatically.
  # Returns [url_or_nil, failure_reason_or_nil] where failure_reason is
  # :not_found or :wrong_mention so callers can surface the right error.
  def resolve_checkpoint_message(slack_id, provided_permalink)
    if provided_permalink.present?
      result = SlackCheckpointService.verify_permalink(provided_permalink, slack_id)
      result == :ok ? [ provided_permalink, nil ] : [ nil, result ]
    else
      url = SlackCheckpointService.find_checkpoint_message(slack_id)
      [ url, url ? nil : :not_found ]
    end
  end

end
