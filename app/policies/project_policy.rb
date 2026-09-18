# frozen_string_literal: true

class ProjectPolicy < ApplicationPolicy
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
    return false if final_review_used? # The project already spent its one post-cutoff review
    return false if resubmit_deadline_passed? # The returned ship's grace window has closed

    !user.trial? && owner? # Only verified project owners can submit for review
  end

  def reship?
    return false if record.discarded?
    return false unless record.ships.where(status: :pending).exists? # Only an in-queue submission can be pulled back and re-shipped
    return false unless user.present?

    return false if final_review_used? # Swapping an in-flight ship stays allowed until a verdict lands

    !user.trial? && owner? # Same gate as ship? — verified owners only
  end

  def refresh_cover?
    return false if record.discarded?
    return false unless user.present?

    !user.trial? && owner? # Cover refresh hits the GitHub API — verified owners only (mirrors ship?)
  end

  # Why Submit is unavailable to someone who would otherwise be able to use it — drives the
  # still-clickable Submit button that raises an explanatory popup instead of disappearing. nil when
  # Submit works, or when this user has no business submitting at all (then the button stays hidden).
  def ship_block_reason
    return nil if ship?
    return nil if record.discarded?
    return nil unless user.present? && !user.trial? && owner?
    return nil if record.ships.where(status: %i[pending awaiting_identity]).exists? # Already in the queue

    return :submissions_closed if !record.ships.exists? && new_submissions_disabled?
    return :final_review_used if final_review_used?
    return :deadline_passed if resubmit_deadline_passed?

    nil
  end

  # The wind-down rules are live for this user: the :final_reviews flag is on and they hold no per-user
  # exemption. Public so callers can avoid surfacing a resubmit deadline that isn't actually enforced.
  def final_reviews_enabled?
    return false unless user.present?

    Flipper.enabled?(:final_reviews) && !Flipper.enabled?(:final_reviews_override, user)
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
    return @new_submissions_disabled if defined?(@new_submissions_disabled) # Memoized — ship? and ship_block_reason both ask on the same render

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

  # A submission made on/after FINAL_REVIEW_CUTOFF has already received a reviewer verdict, which
  # permanently closes the project to further submissions whatever that verdict was. Superseded ships
  # are excluded by REVIEWED_STATUSES — the user pulled those back before any reviewer finished.
  def final_review_used?
    return false unless final_reviews_enabled?

    return @final_review_used if defined?(@final_review_used) # Memoized — ship?, reship? and ship_block_reason all ask

    @final_review_used = record.ships
                               .where(status: Ship::REVIEWED_STATUSES)
                               .where(created_at: Ship::FINAL_REVIEW_CUTOFF..)
                               .exists?
  end

  # True once the grace window on the project's latest returned ship has closed. Superseded ships are
  # skipped so an abandoned reship doesn't mask the return that actually started the clock.
  def resubmit_deadline_passed?
    return false unless final_reviews_enabled?

    deadline = current_ship_resubmit_deadline
    deadline.present? && Time.current > deadline
  end

  def current_ship_resubmit_deadline
    return @current_ship_resubmit_deadline if defined?(@current_ship_resubmit_deadline)

    latest = record.ships.where.not(status: :superseded).order(:created_at).last
    @current_ship_resubmit_deadline = latest&.resubmit_deadline
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
