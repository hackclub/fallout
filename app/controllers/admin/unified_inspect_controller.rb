class Admin::UnifiedInspectController < ApplicationController
  # Standalone read-only inspector for 3rd-party YSWS Unified DB auditors who
  # don't hold a Fallout account. Access is gated by a presigned HMAC token in
  # the URL path (verified below); the controller intentionally inherits from
  # ApplicationController instead of Admin::ApplicationController so we don't
  # load the admin sidebar's deferred stats / role-based shares.
  allow_unauthenticated_access only: :show
  allow_trial_access only: :show
  skip_onboarding_redirect only: :show

  # No #index action — blanket-skip both Pundit verifiers so Rails 8.1 doesn't
  # raise ActionNotFound on the ApplicationController-registered `only:`/`except:`
  # callbacks. The HMAC token is the security boundary; there's no per-user
  # policy to apply to an unauthenticated auditor request.
  skip_after_action :verify_authorized
  skip_after_action :verify_policy_scoped

  def show
    ship_id = params[:ship_id]
    raise ActionController::RoutingError, "Not Found" unless UnifiedInspectToken.valid?(ship_id, params[:token])

    @ship = Ship.includes(
      :time_audit_review, :requirements_check_review, :design_review, :build_review,
      project: :user
    ).find(ship_id)
    skip_authorization

    render inertia: "admin/unified_inspect", props: { inspection: serialize_inspection(@ship) }
  end

  private

  def serialize_inspection(ship)
    {
      ship: {
        id: ship.id,
        ship_type: ship.ship_type,
        status: ship.status,
        project_name: ship.project.name,
        project_description: ship.project.description,
        owner_display_name: ship.user.display_name,
        owner_email: ship.user.email,
        owner_slack_id: ship.user.slack_id,
        public_hours: ship.approved_seconds ? (ship.approved_seconds / 3600.0).round(1) : nil,
        internal_hours: compute_internal_hours(ship),
        koi_awarded: KoiTransaction.where(ship_id: ship.id, reason: "ship_review").sum(:amount),
        frozen_repo_link: ship.frozen_repo_link,
        frozen_demo_link: ship.frozen_demo_link.presence,
        submitted_at: ship.created_at&.iso8601,
        approved_at: ship_approved_at(ship)&.iso8601
      },
      timeline: build_combined_timeline(ship),
      time_audit: serialize_time_audit(ship)
    }
  end

  # Cycle-wide chronological timeline: every prior attempt's reached stages
  # followed by the inspected ship's full pipeline. The first entry is
  # "Submitted"; each subsequent ship's first entry is "Re-submitted" so the
  # cycle structure reads naturally. Stages auto-cancelled by
  # Ship#cancel_pending_reviews! (e.g. Phase 2 after an RC return) and
  # never-created stages are skipped — they convey no information.
  def build_combined_timeline(ship)
    cutoff = ship.previous_approved_ship&.created_at || Time.at(0)
    prior_ships = ship.project.ships
                      .where.not(status: :awaiting_identity)
                      .where("created_at > ? AND created_at < ?", cutoff, ship.created_at)
                      .includes(:time_audit_review, :requirements_check_review, :design_review, :build_review)
                      .order(:created_at)
                      .to_a

    entries = []
    prior_ships.each_with_index do |s, i|
      entries.concat(timeline_for(s, first_label: i.zero? ? "Submitted" : "Re-submitted"))
    end
    entries.concat(timeline_for(ship, first_label: prior_ships.empty? ? "Submitted" : "Re-submitted"))
    # Cap the timeline with a system-derived approval marker so the cycle
    # visibly ends. Sourced from the PaperTrail transition (same source as
    # JustificationRenderer#approved_at_iso8601) for stability.
    if ship.approved?
      entries << {
        key: "project-approved-#{ship.id}",
        label: "Project approved",
        status: "approved",
        actor: nil,
        at: ship_approved_at(ship)&.iso8601,
        feedback: nil,
        internal_notes: nil
      }
    end
    entries
  end

  # Entries for one ship: its submission, then its review stages. Skips reviews
  # that never existed or were auto-cancelled (Ship#cancel_pending_reviews!) —
  # those convey nothing for an auditor. Keys are namespaced by ship_id so
  # React keys stay unique across the merged array.
  def timeline_for(s, first_label:)
    phase_two = s.design_review || s.build_review
    raw_stages = [
      [ "time_audit", "Time Audit", s.time_audit_review, nil ],
      [ "requirements_check", "Requirements Check", s.requirements_check_review, nil ],
      [
        s.ship_type == "build" ? "build_review" : "design_review",
        s.ship_type == "build" ? "Build Review" : "Design Review",
        phase_two,
        phase_two&.internal_reason.presence
      ]
    ].reject { |_k, _l, r, _n| r.nil? || r.cancelled? }

    [
      {
        key: "submitted-#{s.id}",
        label: first_label,
        status: "submitted",
        actor: s.user.display_name,
        at: s.created_at&.iso8601
      },
      *raw_stages.map do |key, label, review, notes|
        stage = review_stage(key, label, review, internal_notes: notes)
        stage.merge(key: "#{key}-#{s.id}")
      end
    ]
  end

  # Returns nil if the TA didn't end in :approved — the inspector page only
  # surfaces TA evidence when the audit actually passed (consistent with the
  # YSWS Unified DB row only existing for fully-approved ships).
  def serialize_time_audit(ship)
    ta = ship.time_audit_review
    return nil unless ta&.approved?

    annotations_by_rec_id = ta.annotations.is_a?(Hash) ? (ta.annotations["recordings"] || {}) : {}
    entries = ship.new_journal_entries
                  .order(:created_at)
                  .includes(recordings: :recordable)
                  .to_a
    return nil if entries.flat_map(&:recordings).empty?

    serialized_entries = entries.each_with_index.map do |entry, i|
      {
        id: entry.id,
        position: i + 1,
        created_at: entry.created_at&.iso8601,
        content_html: helpers.render_user_markdown(entry.content.to_s),
        recordings: entry.recordings.map { |rec| serialize_ta_recording(rec, annotations_by_rec_id[rec.id.to_s] || {}) }
      }
    end
    original_seconds = serialized_entries.flat_map { |e| e[:recordings] }.sum { |r| r[:original_seconds] }

    {
      original_seconds: original_seconds,
      approved_seconds: ta.approved_seconds,
      reviewer: reviewer_label(ta.reviewer),
      feedback: ta.feedback.presence,
      entries: serialized_entries
    }
  end

  # Per-recording shape consumed by the inspector page. `original_seconds` and
  # `approved_seconds` mirror the per-recording side of Ship#compute_approved_seconds
  # so auditors can see the deflation applied to each video without re-deriving it.
  def serialize_ta_recording(rec, ann)
    recordable = rec.recordable
    multiplier = recordable.is_a?(YouTubeVideo) ? (ann["stretch_multiplier"]&.to_f || 1.0) : 60.0
    raw_duration =
      case recordable
      when LookoutTimelapse, LapseTimelapse then recordable.duration.to_i
      when YouTubeVideo then recordable.duration_seconds.to_i
      else 0
      end
    original_seconds = (recordable.is_a?(YouTubeVideo) ? raw_duration * multiplier : raw_duration).to_f
    approved_seconds = original_seconds
    (ann["segments"] || []).each do |seg|
      real_range = (seg["end_seconds"].to_f - seg["start_seconds"].to_f) * multiplier
      case seg["type"]
      when "removed"  then approved_seconds -= real_range
      when "deflated" then approved_seconds -= real_range * (seg["deflated_percent"].to_f / 100)
      end
    end

    base = {
      id: rec.id,
      type: rec.recordable_type,
      name: recordable.try(:name) || recordable.try(:title) || "Recording",
      original_seconds: original_seconds.to_i,
      approved_seconds: [ approved_seconds.round, 0 ].max,
      segments: ann["segments"] || [],
      # TA reviewer's per-recording note. Required to mark the entry reviewed
      # (see admin/reviews/time_audits/show.tsx#entryReviewedCheck) so this is
      # reliably populated for approved TAs.
      description: ann["description"].presence,
      stretch_multiplier: ann["stretch_multiplier"]&.to_i || 1
    }
    case recordable
    when LookoutTimelapse, LapseTimelapse
      base.merge(playback_url: recordable.playback_url, thumbnail_url: recordable.thumbnail_url)
    when YouTubeVideo
      base.merge(
        video_id: recordable.video_id,
        thumbnail_url: recordable.thumbnail_url,
        yt_duration_seconds: recordable.duration_seconds
      )
    else
      base
    end
  end

  # Each stage = the moment the review left :pending. Sources the timestamp from
  # the PaperTrail version that recorded the transition so it's stable against
  # later attribute writes (matches JustificationRenderer#approved_at_iso8601).
  # Always emits the reviewer's feedback (user-facing) and internal_notes
  # (operator-facing) when present — per-stage attribution for auditors.
  def review_stage(key, label, review, internal_notes: nil)
    return { key:, label:, status: "not_started", actor: nil, at: nil, feedback: nil, internal_notes: } unless review

    transition_version = review.versions.reorder(:created_at).find { |v| v.object_changes&.key?("status") }
    at = review.pending? ? nil : (transition_version&.created_at || review.updated_at)
    {
      key:,
      label:,
      status: review.status,
      actor: reviewer_label(review.reviewer),
      at: at&.iso8601,
      feedback: review.feedback.presence,
      internal_notes: internal_notes.presence || review.try(:internal_reason).presence
    }
  end

  def reviewer_label(user)
    return nil unless user
    "#{user.display_name} (#{user.email})"
  end

  def ship_approved_at(ship)
    return nil unless ship.approved?
    approved_int = Ship.statuses["approved"]
    version = ship.versions.reorder(:created_at).find { |v| (v.object_changes&.dig("status") || [])[1] == approved_int }
    version&.created_at || ship.updated_at
  end

  def compute_internal_hours(ship)
    base = ship.approved_seconds || 0
    dr_adj = ship.design_review&.hours_adjustment || 0
    br_adj = ship.build_review&.hours_adjustment || 0
    return nil if base.zero? && dr_adj.zero? && br_adj.zero?
    ((base + dr_adj + br_adj) / 3600.0).round(1)
  end
end
