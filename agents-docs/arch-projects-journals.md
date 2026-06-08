---
name: Projects & Journals Architecture
description: Core domain models — projects, journal entries, recordings, ships, collaboration invites, and their relationships
type: project
originSessionId: bb8ce051-7e1a-4ccd-bd96-7b3a575d339a
---
# Projects, Journals & Recordings

The core domain loop: users create **Projects**, log work via **Journal Entries** (with attached **Recordings**), and submit **Ships** for review. **Collaborators** allow multi-user projects.

## Entity Relationships

```
User
 ├── has_many Projects (owner)
 ├── has_many JournalEntries (author — may differ from project owner)
 ├── has_many Collaborations (Collaborator records, polymorphic)
 ├── has_many LapseTimelapses, LookoutTimelapses (owned media)
 └── has_many Critters (rewards)

Project (soft-deletable)
 ├── belongs_to User (owner)
 ├── has_many JournalEntries
 ├── has_many Ships (submissions)
 ├── has_many Collaborators (polymorphic, soft-deletable)
 ├── has_many CollaborationInvites (soft-deletable)
 └── has_many collaborator_users (through Collaborators)

JournalEntry (soft-deletable)
 ├── belongs_to User (author) + Project
 ├── has_many Recordings (destroyed on discard — unlinks, doesn't delete media)
 ├── has_many Collaborators (polymorphic — credited contributors)
 ├── has_many Critters (gamification rewards, nullified on discard)
 └── has_many_attached images (Active Storage, max 20, 10MB, PNG/JPEG/GIF/WebP)

Recording (join table, delegated_type)
 ├── belongs_to JournalEntry + User
 └── delegated_type :recordable → LapseTimelapse | YouTubeVideo | LookoutTimelapse

Ship (audit-trailed)
 ├── belongs_to Project + optional Reviewer (User)
 ├── enum status: pending → approved | returned | rejected
 └── frozen_* fields: snapshot of project state at submission time
```

## Projects — `app/models/project.rb`

- **Soft-deletable** via Discardable concern
- **Tags**: PostgreSQL array column
- **URL validations** on `demo_link`, `repo_link`
- **`is_unlisted`**: controls public visibility (default false)
- **PaperTrail** for audit history
- **`unified_thumbnail` (ActiveStorage attachment)** + `unified_thumbnail_source_url` / `unified_thumbnail_etag` / `unified_thumbnail_checked_at` columns: cached, pre-rasterized zine/poster image used as the project's cover on the bulletin board explore feed and `/api/v1/explore`. Populated by [`ComputeProjectUnifiedThumbnailJob`](../app/jobs/compute_project_unified_thumbnail_job.rb) (uses `ShipChecks::UnifiedScreenshotFinder` + `ShipChecks::UnifiedScreenshotProcessor.download_with_etag` for conditional GET freshness). Because zines are added near ship time (not at creation), it's enqueued only when a zine plausibly exists: on demand from the project page's "Check for my zine" button (`ProjectsController#refresh_cover`, verified owners), from `ShipPreflightJob` when the zine check passes (reusing preflight's repo fetch), from `AttachShipUnifiedScreenshotJob` after a ship's zine is discovered, on Project after_commit when `repo_link` changes (cleared or swapped) to purge the stale cover (no scan), and by the hourly [`RefreshStaleUnifiedThumbnailsJob`](../app/jobs/refresh_stale_unified_thumbnails_job.rb) (limited to projects that already have a cover). See [arch-explore.md](arch-explore.md) for the cover-image priority chain and the full refresh contract.

**Key methods:**
- `time_logged` — aggregates duration from LapseTimelapse, LookoutTimelapse, and YouTubeVideo (stretch-multiplied) recordings across all kept journal entries on the project, plus admin-set `manual_seconds`.
- `user_logged_seconds(user)` / `Project.batch_user_logged_seconds(ids, user)` — the user's attributed share of the project's hours. Each kept journal entry's seconds are divided among its attribution set (author ∪ kept journal collaborators); the user's share of `manual_seconds` is then added (split by project member_count). Used by My Projects cards, project detail header, and rolled up into `User#total_time_logged_seconds`.
- `user_approved_seconds(user)` / `Project.batch_user_approved_seconds(ids, user)` — proportional split of approved TA seconds: `approved_public_seconds_P × user_share_P / approved_cycle_logged_P`. The denominator only includes journal entries claimed by approved ships on that project; newer unshipped journals and `manual_seconds` do not affect already-approved hours. Per-user sums equal the project's approved total exactly (no double-count).
- `HoursStatsCalculator` (`app/services/hours_stats_calculator.rb`) — bulk **all-users** equivalents of the above, pivoting the same per-journal / per-project integer-division shares to aggregate by user in ~7 queries instead of ~12 per user. `logged_seconds_by_user` mirrors `batch_user_logged_seconds`; `internal_approved_seconds_by_user` mirrors `batch_user_internal_approved_seconds` (admin "build_approved" mode: approved seconds + DR/BR `hours_adjustment`). Used by the admin hours-stats dashboard (`Admin::HoursStatsController`), which computes **live** per request — verified byte-identical to the per-user helpers across all users. If you change any attribution rule above, update this calculator in lockstep.
- `owner_or_collaborator?(user)` — checks ownership OR collaboration
- `discard` (override) — **cascades in transaction**: soft-deletes collaborators, invites, and journal entries

**Policy (`app/policies/project_policy.rb`):**
- `show?`: staff OR owner OR collaborator (flag-gated) OR listed (public). Discarded projects are admin-only.
- `create?`: trial users limited to 1 project (`user.projects.kept`)
- `update?`/`destroy?`: owner only (admins edit via `/admin` or Airtable, not this policy). `destroy?` also blocked once any ship exists (audit integrity).
- `ship?`: verified, non-trial owner; blocked while a `pending` or `awaiting_identity` ship exists.
- `refresh_cover?`: verified, non-trial owner (mirrors `ship?` — hits the GitHub API).
- `export_journal?`: admin OR owner.
- `update_manual_seconds?` / `toggle_burnout?`: admin only.
- `manage_collaborators?`: owner only, flag-gated, verified-only (admins do not manage collaborators via this policy).
- **Scope**: staff see all; everyone else sees kept+listed projects, their own projects, and (flag-gated) projects they collaborate on.

## Journal Entries — `app/models/journal_entry.rb`

- **Validation**: author must own OR collaborate on the project
- **Images**: up to 20 via Active Storage direct upload, validated content type + size
- **Soft-delete**: custom `discard` destroys Recording links (freeing media for reuse) but preserves underlying timelapses/videos
- **Collaborators**: polymorphic Collaborator rows (`collaboratable_type = "JournalEntry"`). Validated against project participants. Journal collaborators do NOT need to be project collaborators — adding someone as a journal collaborator credits them with attribution on this entry regardless.
- **Hours attribution**: `JournalEntry#time_logged` sums recording durations. The entry's hours are shared equally among `{author} ∪ kept_collaborator_users` — this set is the divisor for `Project.batch_user_logged_seconds`. A discarded author still occupies a slot (so survivors don't quietly inherit a leaver's share), but no one renders attribution for a discarded user.

**Policy (`app/policies/journal_entry_policy.rb`):**
- `create?`: project owner always (preserves trial behavior); collaborators only if verified + flag enabled
- `show?`: admin OR journal author OR project owner (always) OR project collaborator (flag-gated). Project owner access is intentionally NOT flag-gated — owners always see entries on their own projects.
- `update?`/`destroy?`: admin OR (entry author AND (project owner OR project collaborator with flag enabled)). The AND is important — the author must also have access to the project.
- `switch_project?`: same access as `update?`, but only for unshipped entries (`ship_id` must be nil). Approved projects are still valid move targets for unshipped entries.
- **Scope**: returns entries the user authored, entries on projects they own, and entries on projects they collaborate on (flag-gated)

**Creation flow (`app/controllers/journal_entries_controller.rb#create`):**
1. Create JournalEntry record
2. Attach images from signed blob IDs
3. For each selected timelapse: find/create the timelapse model, call `refetch_data!`, create Recording link
4. For each YouTube video: find existing YouTubeVideo, create Recording link
5. For each Lookout token: validate ownership in `user.pending_lookout_tokens`, create LookoutTimelapse, create Recording, remove from pending
6. Add journal entry collaborators (flag-gated; validated against project participants, verified+kept users only, minus the creator)
7. Award a critter to the creator if `can_earn_critter?` (not trial), then `award_critters_to_collaborators` does the same for each journal collaborator. Record streak activity and invalidate the streak-warning cache.
8. Redirect to critter reveal (`/spin/:id`) or back to the project / path page (`return_to` param)

**Deferred props**: Lapse timelapses and Lookout sessions are loaded as Inertia deferred props (spinners while loading).

## Recordings — `app/models/recording.rb`

Rails 8 `delegated_type :recordable` pattern. The Recording is a **claim** — it links one journal entry to one timelapse/video. The underlying media persists independently.

**Types:**
| Recordable | Source | Key field | Refresh |
|---|---|---|---|
| `LapseTimelapse` | Lapse API | `lapse_timelapse_id` | `refetch_data!` via LapseService |
| `LookoutTimelapse` | Lookout API | `session_token` | `refetch_data!` via LookoutService. Has `belongs_to :user`. |
| `YouTubeVideo` | YouTube API | `video_id` | `refetch_data!` via YouTubeService |

**Unique constraint**: `(recordable_type, recordable_id)` — one journal entry per timelapse/video at a time. Discarding a journal entry destroys its Recording links, making the media claimable again.

**YouTubeVideo quirk**: Videos ≤60s that aren't live streams are rejected as Shorts (anti-abuse). Unlike LapseTimelapse and LookoutTimelapse, **YouTubeVideo has no `belongs_to :user`** — it's a shared cache of video metadata, not user-owned.

## Ships — `app/models/ship.rb`

Formal project submissions, reviewed through a multi-stage pipeline. **See [arch-ship-and-koi.md](arch-ship-and-koi.md) for the full deep-dive** (preflight, identity gating, TA/RC/DR/BR pipeline, claim/heartbeat, re-ship behavior, koi/gold ledger + built-irl conversion, edge cases). Quick reference:

- **Status lifecycle**: `pending` | `approved` | `returned` | `rejected` | `awaiting_identity` (held until `User#fully_identity_gated?`).
- **Ship type** enum (default `design`): `design` → DesignReview Phase 2, awards **koi**; `build` → BuildReview Phase 2, awards **gold** AND triggers built-irl koi → gold sweep on first approval per project.
- **Frozen fields** at submit time: `frozen_demo_link`, `frozen_repo_link`, `frozen_screenshot`, `frozen_hca_data` (encrypted JSON), `preflight_results`.
- **Submission**: 4-step UI (`pages/projects/ships/preflight.tsx`) → `Projects::ShipsController#create`. `ShipCheckService` runs ~16 user-visible + 3 internal preflight checks via `ShipPreflightJob`.
- **Lifecycle callbacks** (Ship): `after_create :claim_journal_entries!` (assign new entries), `after_create :create_initial_reviews!` (TA + RC), `after_update_commit :create_initial_reviews!` on `awaiting_identity → pending` promotion, `after_update_commit :notify_status_change`.
- **Reviews**: TimeAuditReview + RequirementsCheckReview (Phase 1, parallel, both required). DesignReview OR BuildReview (Phase 2, created via `ensure_phase_two_review!` only after Phase 1 approval). All share the `Reviewable` concern (5min claim TTL, atomic claim, heartbeat, lock_version).
- **Status derivation**: `recompute_status!` runs in same transaction as review status change (after_save, NOT after_commit) to prevent drift. Any rejected → rejected; any returned → returned (sibling pending reviews get cancelled, feedback aggregated); all approved → approved.
- **Re-ship**: `claim_journal_entries!` only claims entries not already locked to an *approved* ship. TA annotations carry forward — re-ship with no new recordings auto-approves the new TA.
- **Terminal-status guard**: `Ship#status_transition_allowed` blocks transitions out of approved/returned/rejected; admins cannot bypass via the model.
- **Policy (`app/policies/ship_policy.rb`)**: Index/show: admin or staff reviewer (or owner/assigned). Create: verified, non-trial owners. **`ProjectPolicy#ship?` blocks resubmission while a `pending` or `awaiting_identity` ship exists.** Update: admin only (reviewers go through review-specific policies). Destroy: admin only.
- **Per-review policies**: each requires `record.pending? && (admin? || active_claimer?)` for updates — must hold a non-expired claim. Flagged-project reviews are admin-only-visible.

## Collaboration System (Feature-Flagged)

Gated behind `Flipper.enabled?(:collaborators, user)`. All policies check `collaborators_enabled?` before granting access.

### Collaborator — `app/models/collaborator.rb`

Polymorphic join: can belong to Project OR JournalEntry.

**Validations:**
- User must be verified (not trial)
- User cannot be the resource owner
- Unique per `(user_id, collaboratable_type, collaboratable_id)`

Soft-deletable. Cascade-deleted when parent project is discarded.

### Two-tier invite flow

Invites are sent **by email** and only become a real `CollaborationInvite` once an account claims them. The two models:

**PendingCollaborationInvite — `app/models/pending_collaboration_invite.rb`** (email-keyed, token-linked)
- Columns: `invitee_email`, `token` (unique, urlsafe_base64, auto-generated), `status` enum `pending` → `claimed` | `revoked`, optional `collaboration_invite_id` (set on claim). Soft-deletable.
- Validations: valid email format, no duplicate pending invite per project+email, email cannot be the project owner's.
- `claim!(user)` — in a transaction, creates the real `CollaborationInvite`, sends the invite mail, marks itself `claimed`. Idempotent (returns the existing invite if already claimed).
- `claim_all_for_email!(email, user)` — claims every matching pending invite for a newly verified user (skips invalid ones).

**CollaborationInvite — `app/models/collaboration_invite.rb`** (user-keyed, the acceptance surface)
- **Status**: `pending` → `accepted` | `declined` | `revoked`
- **Validations:** invitee must be verified, cannot be project owner, no duplicate pending invite per project+invitee, cannot already be a collaborator.
- **Accept flow**: creates a Collaborator record. Invitee can then create journal entries on the project and be credited as collaborator on entries.

**Send path**: `POST /projects/:id/collaboration_invites` (`Projects::CollaborationInvitesController#create`) takes an `email`, not a user id. It builds a `PendingCollaborationInvite` and enqueues `ProcessCollaborationInviteJob`. Responses are deliberately uniform ("Invite sent!") regardless of whether the email maps to a verified user, a duplicate, a self-invite, or nothing — to prevent email enumeration (the claim/mail branching runs in the background so response timing doesn't leak either).

**Routes (split across three controllers):**
- `Projects::CollaborationInvitesController` (nested under projects, owner actions, flag-gated):
  - `POST /projects/:id/collaboration_invites` — send invite by email (`manage_collaborators?`)
  - `DELETE /projects/:id/collaboration_invites/:id` — revoke (`revoke?`); also revokes the linked pending invite
- `CollaborationInvitesController` (top-level, invitee actions on a claimed invite, flag-gated):
  - `GET /collaboration_invites/:id` — show invite
  - `POST /collaboration_invites/:id/accept` — accept
  - `POST /collaboration_invites/:id/decline` — decline
- `PendingCollaborationInvitesController` (universal email link):
  - `GET /i/:token` (`pending_invite`) — `allow_unauthenticated_access` + `allow_trial_access`; renders state-specific UI (`unauthenticated` / `trial` / `wrong_user` / `revoked`) or, for a matching verified user, calls `claim!` and redirects to the real invite.

**Why split**: the nested controller handles owner actions scoped to a project; the top-level controller handles invitee actions on an already-claimed invite; the pending controller handles the public email link that works in any auth state (and bridges trial → verified users via `session[:return_to]`).

## LookoutSessionsController — `app/controllers/lookout_sessions_controller.rb`

Creates and manages recording sessions:
- `new` — creates Lookout session via API, stores token in `user.pending_lookout_tokens` (PG array on User model)
- `record` — validates token ownership, renders the recording UI page

## Lookout Token Lifecycle

1. `LookoutSessionsController#new` creates session via Lookout API → stores token in `user.pending_lookout_tokens` (PG array)
2. Token appears in journal creation form as deferred prop
3. On journal entry creation: token validated against pending list, LookoutTimelapse created, Recording linked, token removed from pending
4. If journal is discarded: Recording destroyed, but LookoutTimelapse persists (signed URLs still work for 1 hour)

## Frontend Pages

- **`pages/projects/index.tsx`** — card grid with cover images, stats (entry count, time logged, recordings)
- **`pages/projects/show.tsx`** — detail view with collaborators, pending invites, journal entry list
- **`pages/projects/form.tsx`** — create/edit with Inertia `useForm`
- **`pages/journal_entries/new.tsx`** — book-style dual-pane: left = markdown editor + image upload, right = tabbed media browser (Lapse/YouTube/Lookout)
- **`pages/collaboration_invites/show.tsx`** — accept/decline invite
- **`pages/pending_collaboration_invites/show.tsx`** — email-link landing page (sign-in / verification prompts, revoked / wrong-user states)

## Journal Export

- **Route:** `GET /projects/:id/export_journal`
- **Controller:** `ProjectsController#export_journal`
- **Policy gate:** `ProjectPolicy#export_journal?`
- **Access:** owner or admin only (not collaborators)
- **Output:** markdown download named `<project>-journal.md` with:
  - ordered journal entries (oldest → newest)
  - entry metadata (id, author, timestamp)
  - raw journal content
  - recording links for Lapse/Lookout playback URLs and YouTube watch URLs

## Project Link Unfurl

- Direct project links (`/projects/:id`) now emit OG/Twitter meta tags for link unfurl cards.
- For normal browser visits, `/projects/:id` still redirects to `/bulletin_board?project=:id` to open as modal.
- Slackbot user-agent requests are excluded from that redirect so crawlers can read project metadata.
