# frozen_string_literal: true

class ProjectPolicy < ApplicationPolicy
  # On/after this instant, the :limit_reships flag caps a project at one returned-ship resubmission
  # (see #return_reship_limit_reached?).
  RESHIP_LIMIT_CUTOFF = ActiveSupport::TimeZone["America/New_York"].local(2026, 6, 21)

  def index?
    true
  end

  def onboarding?
    true # Any authenticated user can view the project onboarding modal
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

    # Kill switch for first-time submissions: when :disable_new_submissions is on, projects that have
    # never been shipped are blocked, unless the user is granted the :new_submissions_override actor flag.
    if !record.ships.exists? && Flipper.enabled?(:disable_new_submissions) && !Flipper.enabled?(:new_submissions_override, user)
      return false
    end

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

  def manage_collaborators?
    return false unless user.present? && !user.trial? && collaborators_enabled?

    owner? # Only verified project owners manage collaborators from the user-facing project page.
  end

  private

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
