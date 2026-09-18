# frozen_string_literal: true

class ProjectPolicy < ApplicationPolicy
  # On/after this instant, the :limit_reships flag caps a project at one returned-ship resubmission
  # (see #return_reship_limit_reached?).
  RESHIP_LIMIT_CUTOFF = ActiveSupport::TimeZone["America/New_York"].local(2026, 6, 21)

  # A Blueprint/Stasis transfer made after this instant waives the :disable_new_submissions kill switch
  # (see #recent_transfer? — late transferees still get their first submission).
  TRANSFER_WAIVER_CUTOFF = ActiveSupport::TimeZone["America/New_York"].local(2026, 6, 17)

  # Identifies the journal entry the importer writes to mark a Blueprint/Stasis transfer.
  TRANSFER_MARKER = /\AProject transferred from (Blueprint|Stasis)!/

  def index?
    true
  end

  def onboarding?
    # Headless policy call — `record` is the :project symbol, so the per-project transfer waiver can't
    # apply; the :disable_new_submissions kill switch plus the per-user override gate the flow alone.
    return false if user.present? && Flipper.enabled?(:disable_new_submissions) && !Flipper.enabled?(:new_submissions_override, user)

    true # Otherwise any authenticated user can view the project onboarding modal
  end

  def show?
    return false if record.discarded? && !admin?
    staff? || !record.is_unlisted || owner? || (collaborators_enabled? && record.collaborator?(user)) # Collaborators can see unlisted projects they're on (flag-gated)
  end

  def share?
    return false if record.discarded?
    !record.is_unlisted # Only listed projects expose a copyable public URL — unlisted ones are intentionally private.
  end

  def create?
    return false unless user.present?
    return false if new_submissions_disabled? # Kill switch also closes new projects — a brand-new project has never shipped
    return !user.projects.kept.exists? if user.trial?

    true
  end

  def update?
    return false if record.discarded?

    owner? # User-facing project edits are owner-only; admins use /admin or Airtable.
  end

  def update_manual_seconds?
    admin? # Admin-only: manual time overrides for legacy projects
  end

  def toggle_burnout?
    admin? # Admin-only: burnout tag waives recording requirement on journal entries and ships
  end

  def toggle_unlisted?
    admin? # Admin-only: hide/show project from public explore and bulletin board
  end

  def destroy?
    return false if record.discarded?
    return false if record.ships.exists? # Once submitted (any status — pending, awaiting_identity, approved, returned, rejected), the project is locked from deletion for audit integrity.

    owner? # User-facing project deletes are owner-only; admins use /admin or Airtable.
  end

  def export_journal?
    return false if record.discarded?

    admin? || owner? # Journal export contains full project history/media links; restrict to owner/admin only.
  end

  def ship?
    return false if record.discarded?
    return false if record.ships.where(status: %i[pending awaiting_identity]).exists? # Block while a submission is queued or held for identity verification
    return false unless user.present?

    return false if !record.ships.exists? && new_submissions_disabled? # Kill switch blocks first-time submissions
    return false if return_reship_limit_reached? # Resubmitting a returned ship is capped post-cutoff under :limit_reships

    !user.trial? && owner? # Only verified project owners can submit for review
  end

  def reship?
    return false if record.discarded?
    return false unless record.ships.where(status: :pending).exists? # Only an in-queue submission can be pulled back and re-shipped
    return false unless user.present?

    # Note: abandon-pending reships are intentionally NOT subject to :limit_reships — only returned-ship
    # resubmissions (handled in #ship?) count toward the post-cutoff cap.
    !user.trial? && owner? # Same gate as ship? — verified owners only
  end

  def refresh_cover?
    return false if record.discarded?
    return false unless user.present?

    !user.trial? && owner? # Cover refresh hits the GitHub API — verified owners only (mirrors ship?)
  end

  # True when Submit is blocked *only* by the :disable_new_submissions kill switch — drives the
  # still-clickable Submit button that raises the "submissions have closed" popup instead of disappearing.
  def ship_closed?
    return false if record.discarded?
    return false unless user.present? && !user.trial? && owner?
    return false if record.ships.exists? # Closure only applies to projects that have never shipped

    new_submissions_disabled?
  end

  def manage_collaborators?
    return false unless user.present? && !user.trial? && collaborators_enabled?

    owner? # Only verified project owners manage collaborators from the user-facing project page.
  end

  private

  # Kill switch for new projects and first-time submissions: on while :disable_new_submissions is
  # enabled, unless the user holds the :new_submissions_override actor flag or the project was
  # transferred from Blueprint/Stasis after TRANSFER_WAIVER_CUTOFF (late transferees still deserve
  # their first submission).
  def new_submissions_disabled?
    return @new_submissions_disabled if defined?(@new_submissions_disabled) # Memoized — ship? and ship_closed? both ask on the same render

    @new_submissions_disabled =
      if !Flipper.enabled?(:disable_new_submissions) || Flipper.enabled?(:new_submissions_override, user)
        false
      else
        !recent_transfer?
      end
  end

  # True when this project carries a Blueprint/Stasis transfer marker journal entry created after
  # TRANSFER_WAIVER_CUTOFF. Used to waive the :disable_new_submissions kill switch for late transferees.
  def recent_transfer?
    return @recent_transfer if defined?(@recent_transfer) # Memoized — scans every post-cutoff journal entry

    @recent_transfer = record.kept_journal_entries
          .where("created_at > ?", TRANSFER_WAIVER_CUTOFF)
          .any? { |entry| entry.content&.match?(TRANSFER_MARKER) }
  end

  # When :limit_reships is on, a project may resubmit a RETURNED ship at most once on/after
  # RESHIP_LIMIT_CUTOFF. The first post-cutoff return-resubmission is allowed; any subsequent one is
  # blocked. Abandon-pending reships (the Reship! button — preceding ship superseded, not returned) don't
  # count and stay unlimited; first-time submissions are governed by :disable_new_submissions.
  def return_reship_limit_reached?
    return false unless Flipper.enabled?(:limit_reships)
    return false if Flipper.enabled?(:reship_limit_override, user) # Per-user exemption from the cap

    ships = record.ships.order(:created_at).to_a
    # A return-resubmission is a ship whose immediately-preceding ship had been returned. Count those
    # created on/after the cutoff — one is allowed, so the cap is reached once a prior one already exists.
    ships.each_cons(2).count { |prev, ship| ship.created_at >= RESHIP_LIMIT_CUTOFF && prev.status == "returned" } >= 1
  end

  class Scope < ApplicationPolicy::Scope
    def resolve
      if user&.staff?
        scope.all
      else
        base = scope.kept.listed.or(scope.kept.where(user: user))
        if collaborators_enabled?
          collaborated_ids = Collaborator.kept.where(user: user, collaboratable_type: "Project").select(:collaboratable_id)
          base = base.or(scope.kept.where(id: collaborated_ids)) # Include projects user collaborates on (flag-gated)
        end
        base
      end
    end
  end
end
