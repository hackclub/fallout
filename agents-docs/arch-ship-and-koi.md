---
name: Ship Pipeline & Koi Economy
description: End-to-end ship submission, the multi-stage review pipeline (TA → RC → DR/BR), re-ship behavior, identity gating, project flags, claim/lock concurrency, koi & gold ledger model, and edge cases
type: project
originSessionId: bb8ce051-7e1a-4ccd-bd96-7b3a575d339a
---
# Ship Pipeline & Koi Economy

The user's flow: **Project → Journal Entries → Ship → Multi-stage Review → Koi/Gold reward**.
Ships and the dual-currency system are tightly coupled: a **design** ship (DR) awards koi when fully approved; a **build** ship (BR) awards gold when fully approved AND — on a project's *first* approved BR — sweeps the project's accumulated koi into gold (`BuiltIrlConversionService`). See §10 for the full ledger model, cap formula, and idempotency guarantees.

---

## 1. Submission Flow (User Side)

Entry point: `GET /projects/:id/ship` → `Projects::ShipsController#preflight`.

The frontend (`pages/projects/ships/preflight.tsx`) walks 4 steps:
1. **Guidelines** — link to `/docs/requirements/submitting-build` (built-irl projects) or `/docs/requirements/submitting-design`, "I've read & am ready" double-confirm gate. The build/design split keys off `project.built_irl` (passed as a prop from `#preflight`).
2. **Checklist** — hardcoded yes/no items, type-conditional: `DESIGN_CHECKLIST_ITEMS` (5 items) for design projects, `BUILD_CHECKLIST_ITEMS` (6 items) for built-irl projects (digital design / IRL build / README / integration / originality / A5 zine page). All must be checked.
3. **Scan** — `POST /projects/:id/ships/preflight/run` kicks `ShipPreflightJob`. Frontend polls `GET /projects/:id/ships/preflight/status?run_id=…` every 1.5s, then 5s after 10s. Submit button enables only when no `failed` checks remain (warnings allowed).
4. **Submitted** — terminal state. If `awaiting_identity`, copy tells user to finish HCA verification + address; otherwise generic "reviewers will check."

**Concurrency guard**: `#run` cancels any existing running `PreflightRun` for the project (sets to `failed`) before creating a new one — prevents job spam.

### Pre-flight Check Service (`app/services/ship_check_service.rb`)

Two visibility tiers:
- **USER_CHECK_MODULES** (17): description, repo link, journal entry exists, repo public, README exists, BOM exists, PCB files, CAD files, firmware, BOM formatting, BOM has links, zine page, README images/headings/quality, repo organization, images show hardware.
- **INTERNAL_CHECK_MODULES** (4): AI-generated image, image originality, code plagiarism, duplicate project.

Internal checks are skipped (marked `skipped`) if any user check fails — saves LLM/API spend.

Pipelined parallel execution: `MAX_THREADS = 4`, dependency-resolved fetcher order (`repo_meta → repo_tree → readme_content → bom_content → image_descriptions`). Modules launch as soon as their declared `deps` are resolved.

Results cached by `(repo full_name, HEAD commit SHA, MD5(description|repo_link|entry_count|time_logged|tags))` for 12h to avoid repeated GitHub/LLM calls when scanning unchanged state. Any push busts the cache via the SHA; `cache_key` returns nil (cache skipped) when the SHA can't be resolved so stale results aren't served across pushes. Use `force: true` to bypass.

`CheckResult` is a `Data.define(...)` with `passed?/failed?/blocking?/user?/internal?`. Only **user-visible** failures block submission; warnings are non-blocking.

### Ship Creation (`Projects::ShipsController#create`)

```ruby
initial_status = current_user.fully_identity_gated? ? :pending : :awaiting_identity
# The project's user-declared built_irl flag picks the Phase 2 queue at ship time.
ship_type = @project.built_irl? ? :build : :design
ship = @project.ships.build(
  preflight_run:, ship_type:,
  frozen_demo_link: @project.demo_video_link.presence || @project.demo_link,
  frozen_repo_link: @project.repo_link,
  preflight_results: snapshot, status: initial_status
)
```

`ship_type` is **chosen at submission from `@project.built_irl?`** (a user-declared boolean column on the project): built-irl → `:build` (BR/gold), otherwise → `:design` (DR/koi). `frozen_demo_link` prefers the student-submitted `demo_video_link`, falling back to `demo_link`.

`fully_identity_gated?` = `ysws_verified? && has_hca_address?` (i.e., HCA verification status is `"verified"` AND the cached `has_hca_address` flag is true).

**Critical block on duplicate submissions**: `ProjectPolicy#ship?` returns false if any ship in `[:pending, :awaiting_identity]` exists for the project. Once a ship lands in a terminal state (approved/returned/rejected), the user can submit a new one.

---

## 2. The `Ship` Model

`app/models/ship.rb` — `has_paper_trail`. Key columns:

| Column | Notes |
|---|---|
| `status` | enum: `pending`, `approved`, `returned`, `rejected`, `awaiting_identity` |
| `ship_type` | enum (prefix `ship_type_`): `design` (default 0), `build` (1) — chooses Phase 2 reviewer |
| `frozen_demo_link`, `frozen_repo_link`, `frozen_screenshot`, `frozen_hca_data` | snapshot at submission. `frozen_hca_data` is `serialize coder: JSON` + `encrypts` |
| `approved_public_seconds` | mirrored from `time_audit_review.approved_public_seconds` **only when the ship reaches `:approved`** (set inside `recompute_status!` in the same `update!` as the status flip; cleared on any other transition). Self-describing: `approved_public_seconds > 0` ⇒ ship is fully approved. |
| `feedback`, `justification` | `feedback` aggregated from sibling returned-review feedback when status flips to `returned` |
| `preflight_results`, `preflight_run_id` | snapshot of preflight checks at submit time + reference to the run |

Has-one: `time_audit_review`, `requirements_check_review`, `design_review`, `build_review` (each unique by `ship_id`).

### Lifecycle Callbacks

- `after_create :claim_journal_entries!` — runs in the same transaction. Walks `new_journal_entries` (kept entries created after `previous_approved_ship.created_at`) and bulk-updates `ship_id`. Entries already locked to a previously-**approved** ship are skipped — that cycle's history is immutable.
- `after_create :create_initial_reviews!, if: :pending?` — creates a `TimeAuditReview` + `RequirementsCheckReview`. Skipped when ship is `:awaiting_identity`.
- `after_update_commit :create_initial_reviews!, if: :became_pending_from_awaiting?` — fires when an awaiting_identity ship is promoted (e.g., user finishes HCA verification).
- `after_update_commit :notify_status_change, if: :saved_change_to_status?` — `MailDeliveryService.ship_status_changed(self)` for in-app notification on approved/returned/rejected.
- `after_update_commit :award_ship_review_currency!, if: :saved_change_to_status?` — DR koi / BR gold + built-irl conversion on the `:approved` transition (see §10). Rescued + reported to `ErrorReporter`; never rolls back the approval.
- `after_update_commit :enqueue_unified_airtable_upload, if: :saved_change_to_status?` — on `:approved` (skips trial users / missing `AIRTABLE_API_KEY`), enqueues `ShipUnifiedAirtableUploadJob` + `AttachShipUnifiedScreenshotJob` to push the YSWS Unified Submissions row.

### Status transitions

`status_transition_allowed` validates: terminal statuses `[approved, returned, rejected]` cannot transition. Pending → any is fine; `awaiting_identity → pending` fine; nothing else can transition out of terminal. Admins **cannot** bypass this — they must use the review pipeline (`ShipPolicy#update?` returns `admin?` only, but the model validation still blocks terminal transitions).

`derive_status` (called by `recompute_status!`):
1. No reviews yet → `pending`
2. Any rejected → `rejected`
3. Any returned → `returned`
4. All present approved → `approved`
5. Otherwise → `pending`

When a ship transitions to `returned` or `rejected`, `cancel_pending_reviews!` flips any still-pending sibling reviews to `cancelled` (uses `skip_ship_recompute = true` to avoid re-entrant recomputation).

When ship status flips to `returned`, `aggregate_return_feedback` joins all returned reviews' `feedback` with `\n\n---\n\n` and stores on `ship.feedback` so `MailDeliveryService` includes it in the user notification.

### Carry-forward (Re-ship Optimization)

`carry_forward_ta_annotations!` runs during `create_initial_reviews!`. Source: any prior TA that was **approved, returned, OR cancelled** and has recording annotations (any non-pending state where a reviewer has made annotation progress).
- Filter prior annotations down to recordings still present in this cycle.
- If **all** current recordings already have annotations AND the prior TA was specifically `approved` → auto-approve TA with recomputed `approved_public_seconds` (no human review needed). Returned/cancelled prior TAs only seed annotations; they never auto-approve.
- Else if any current recordings already had annotations → seed the new TA with them (human only reviews the new ones / the delta).

This is the "I fixed one thing and re-shipped" optimization — reviewers don't redo work on already-judged recordings, and the optimization extends to re-ships after a returned/cancelled cycle.

### Ship cycle (definition)

A **ship cycle** is the window between two successive approvals on a project. It starts immediately after the previous approved ship and ends when one ship in the window reaches `:approved` — that approval terminates the current cycle and starts a fresh one.

**First-cycle case** (no prior approval): the cycle stretches all the way back to the project's earliest history. Every ship the project has ever had — pending, returned, rejected — is part of that first cycle. Subsequent re-ships start fresh cycles only because they have an approved predecessor.

Bounds (in code, see `Ship#previous_approved_ship`):
- **Start cutoff** = `project.ships.approved.where("created_at < self.created_at").order(created_at: :desc).first&.created_at` (i.e. the immediately-preceding approval), or `Time.at(0)` for the first cycle.
- **End** = the `created_at` of the ship that reaches `:approved` (the *current* ship in any computation about its own cycle).

What's scoped to a cycle:
- **Ships** in the cycle = `project.ships.where("created_at > start_cutoff AND created_at <= end")` — includes any rejected/returned/cancelled attempts plus the approved one that closed the cycle. Counter for `{ATTEMPTS_MSG}` derives from this.
- **Journal entries** = entries with `ship_id` set to a ship in this cycle. `Ship#claim_journal_entries!` sets `ship_id` on `after_create` and explicitly skips entries already locked to an *approved* prior ship (cycle history is immutable).
- **Recordings** = recordings whose journal entry is in the cycle.
- **Hours** = the three flavors in §7, all derived from this cycle's recordings/journal entries (never the project's lifetime totals).

Re-ships after a prior approval start a fresh cycle — counters reset, and the previous cycle's journal entries / hours / koi are sealed.

---

## 3. Multi-stage Review Pipeline

### Phase 1 (Parallel)
- `TimeAuditReview` (TA) — assigned to `time_auditor` role. Sets `approved_public_seconds` + `annotations: { recordings: { "<id>": { description, segments: [{type: "removed"|"deflated", start_seconds, end_seconds, deflated_percent}], stretch_multiplier } } }`.
- `RequirementsCheckReview` (RC) — assigned to `requirements_checker` OR `pass2_reviewer`. Has `repo_tree` jsonb (populated by `FetchRepoTreeJob` on `after_create_commit`). The controller exposes a `refresh_tree` member action (`POST /admin/reviews/requirements_checks/:id/refresh_tree`) to re-fetch the tree on demand.

### Phase 2 (Single, type-conditional)
Created by `Ship#ensure_phase_two_review!` only after `phase_one_complete?` (both TA and RC approved — checked via direct DB existence query, not association cache, for concurrency).

- `DesignReview` if `ship_type == design` (default).
- `BuildReview` if `ship_type == build`.

Both share most schema: `feedback`, `internal_reason`, `hours_adjustment` (private add-on to public TA hours), `annotations` jsonb. The currency-adjustment column differs by type because the two reviews issue different currencies — **DR has `koi_adjustment`** (added to koi award), **BR has `gold_adjustment`** (added to gold award). See §10 for the full DR-koi / BR-gold / built-irl-conversion mechanics. Both reviews are gated to `pass2_reviewer` only.

### "Changes Since Last Review" (re-ship diff)
RC, DR, and BR show pages surface a `RepoDiffCard` (`repo_diff` jsonb column) summarizing what changed in the repo since the previous relevant review — file add/modify/remove/rename counts + commit count, rendered as a clickable tree linking to each file's GitHub diff. Built for re-ships.

- **Computed once on creation, like `repo_tree`**: `Reviewable` runs `after_create_commit :compute_repo_diff` → `ComputeReviewRepoDiffJob` (gated by `respond_to?(:repo_diff)` so TA is skipped), which calls `ReviewRepoDiffService.for_review` and stores the summary in the review's `repo_diff` column. The controllers read `@review.repo_diff` directly (not deferred). The diff therefore reflects the repo near submission and can lag slightly behind later pushes — an accepted trade-off matching `repo_tree`.
- **Anchor scope differs by review type**: RC diffs against the last completed **RC/DR/BR**; DR/BR diff against the last completed **DR/BR** — declared per class via `repo_diff_anchor_classes` and resolved by `ReviewRepoDiffService.anchor_review_for` (most recent terminal review of those classes for the project, excluding the current ship).
- **SHA-anchored with date fallback**: RC/DR/BR carry a `reviewed_commit_sha` column, captured on terminal transition by `CaptureReviewCommitShaJob` (enqueued from `Reviewable#capture_reviewed_commit_sha`). The service compares the anchor's stored SHA against current HEAD; if the SHA is missing (older reviews) or force-pushed out of the repo (compare 404s), it falls back to the commit at the anchor review's `completed_at`.
- **GitHub plumbing**: `GithubService.compare` (commit count + per-file status), `head_commit_sha`, `commit_sha_at` (date fallback), and `parse_repo` (shared owner/repo extraction, also used by `FetchRepoTreeJob`).
- The `5` keyboard shortcut toggles the card on RC and DR show pages (BR intentionally has no shortcut).

Admin-only swap (`Ship#swap_phase_two_type!`) moves a pending Phase 2 review between DR and BR. The swap maps DR's `koi_adjustment` ↔ BR's `gold_adjustment` (same semantic knob — a signed integer credit/debit on the hours-derived currency) and preserves the review's `created_at` so queue wait time stays intact.

Time Audit now rejects link-only feedback in the admin controller (`Admin::Reviews::TimeAuditsController#update`). If `feedback` consists only of one or more `http(s)` URLs, the update is rejected with an inline validation error requiring written explanation.

`Ship#phase_one_complete?` does:
```ruby
TimeAuditReview.where(ship_id: id, status: :approved).exists? &&
  RequirementsCheckReview.where(ship_id: id, status: :approved).exists?
```

### `Reviewable` Concern (`app/models/concerns/reviewable.rb`)

Shared by all 4 review types. Provides:

**Status & uniqueness**
- enum: `pending(0)`, `approved(1)`, `returned(2)`, `rejected(3)`, `cancelled(4)`
- `validates :ship_id, uniqueness: true` (so each ship has at most one of each review type)
- Terminal status transitions blocked (same logic as Ship)
- `lock_version` column → optimistic locking for safe concurrent edits

**Claim system** (`CLAIM_DURATION = 10.minutes` TTL)
- `claim_expires_at`, `reviewer_id` columns
- `atomic_claim!(review_id, user)` — single `UPDATE … WHERE … status=pending AND (reviewer_id IS NULL OR reviewer_id = uid OR claim_expires_at IS NULL OR claim_expires_at <= now)`. Returns true iff one row updated. Race-safe.
- `release_all_claims!(user)` — wipes claim cols for any pending claims by user; preserves `reviewer_id` audit trail on terminal reviews.
- `active_claim_for(user)`, `available_for(user)`, `next_eligible(user, skip_ids:, sort:)` — queue helpers. `sort:` is `:waiting` (default, oldest ship first, with the +2d priority boost) or `:hours` (most TA-approved lifetime hours for the project owner first); both prioritize the user's own claim.
- `extend_claim!`, `release_claim!` — instance helpers
- "One claim at a time across types": `Admin::Reviews::BaseController#claim_review!` calls `release_all_claims!` for ALL `Reviewable::REVIEW_MODELS` before atomically claiming the new one.

**Auto-recompute on save**
- `after_save :recompute_ship_status!, if: :saved_change_to_status?` — runs `ship.with_lock { ensure_phase_two_review!; recompute_status! }` in the same transaction (NOT after_commit) to prevent observable drift between review and ship status.
- `attr_accessor :skip_ship_recompute` — bulk operations like `cancel_pending_reviews!` set this so the caller recomputes once.

**Available scope flag awareness**
- `available_for(user)` excludes ships whose project is in `ProjectFlag` (flagged projects only visible to admins).

### Reviewer Roles & Authorization

`User::REVIEWER_ROLES = %w[time_auditor requirements_checker pass2_reviewer]`. Plus `admin` and `hcb` (real-money gate, separate).

`User#can_review?(queue)`:
- `time_audit` → `time_auditor?` (or admin)
- `requirements_check` → `requirements_checker? || pass2_reviewer?`
- `design_review`, `build_review` → `pass2_reviewer?`

Each review's `Policy#update?` requires `record.pending? && (admin? || active_claimer?)`. `active_claimer?` checks `record.claimed_by?(user)` — i.e., not just `reviewer_id` match, but a non-expired claim. **Updates without an active claim fail authorization** — heartbeat is what keeps the claim alive.

**Reviewer attribution invariant**: any review reaching `approved/returned/rejected` must carry a non-NULL `reviewer_id`. The claim system normally sets it on page load, but `ExpireStaleReviewClaimsJob` can clear it between page load and submit (and admins can submit without an active claim). To guarantee attribution, controllers set `@review.finalizing_user = current_user` before `#update`; `Reviewable#stamp_finalizing_reviewer` (before_update) backfills `reviewer_id` only when blank, preserving the original claimer when one exists. Cancellations are intentionally excluded — `cancel_pending_reviews!` is system-driven and has no reviewer.

### Heartbeat & Skip Flow

- `POST /admin/reviews/:type/:id/heartbeat` — extends claim by `CLAIM_DURATION` (10min) if `claimed_by?(current_user)`. Returns JSON `{ok, expires_at}` or 409 `{error: "claim_lost"}`. The frontend `useReviewHeartbeat` hook (`app/frontend/hooks/useReviewHeartbeat.ts`) beats every **2 minutes** (`HEARTBEAT_INTERVAL_MS`) and alerts on 409 or 2 consecutive failures.
- `GET /admin/reviews/:type/next?skip=1,2,3&sort=waiting|hours` — `next_eligible` orders by "your existing claim first, then oldest pending (or most owner-hours when `sort=hours`)." The chosen sort persists in session across PATCH/redirect cycles. Reviewers click "skip" to avoid a tricky review and add it to the URL skip list. In `:waiting` mode, **priority** ships get a `ReviewPriorityCalculator::WAIT_BOOST` (+2 days) handicap applied to their real wait *for ordering math only* — the actual wait is unchanged. Because priority needs the proportional approved-hours pass, the waiting branch resolves it in Ruby over the candidate set instead of in SQL.
- `redirect_to_next_or_index` (called after approve/return/reject) — clears `claim_expires_at` (keeps `reviewer_id` for audit), appends current id to skip list, redirects to `next`.
- Admin viewing a review they don't own enters "supervisory mode" — no claim taken, no redirect.
- Any queue reviewer can open a **completed** (non-pending) review read-only — `claim_review!` no longer redirects non-admins away from terminal reviews; `show?` still authorizes the queue role (and blocks flagged for non-admins) and `update?` (pending-only) keeps it view-only. The `useReviewHeartbeat` hook is passed `enabled = !isTerminal`, so read-only views send no heartbeats (no false "session expired" alert). A still-pending review claimed by someone else continues to auto-advance to `next`.

### Admin/Reviewer Index Pages

Each review controller's `#index` returns:
- `pending_reviews`: `policy_scope.pending.where.not(ship_id: flagged_ship_ids).order(:created_at)`, then re-sorted in Ruby via `sort_pending` (`:hours` → owner lifetime hours desc; otherwise real wait with the +2d priority boost). The working queue.
- `all_reviews`: paginated by `created_at desc` for full history. Flagged projects shown but visually marked.

**Priority rows (`ReviewPriorityCalculator`)**: a pending ship is flagged `priority: true` when ANY one collaborator (owner or kept collaborator), evaluated independently, is **not yet qualified** (< 60h approved) AND either (a) already has ≥50h of proportional approved public hours, or (b) would cross 60h once this ship's hours land — (b) only applies once the Time Audit has approved (so the ship's eventual hours are known). Collaborators already at ≥60h are excluded — they've qualified and don't need a priority review. Approved hours use the live per-user proportional total (`HoursStatsCalculator.public_approved_seconds_by_user`, bounded to the members' attributable approved projects). Priority rows render with a green background (precedence: green > blue `previously_reviewed_by_me` > yellow `sibling_approved`) and receive the +2d ordering boost in both the index and `next_eligible`. Computed in bulk for the whole page — no per-row queries.

`flagged_ship_ids = Ship.where(project_id: ProjectFlag.select(:project_id)).select(:id)` — flagged projects are hidden from the queue but visible in the all-table.

---

## 4. Project Flags

`app/models/project_flag.rb` — admin or reviewer raises a flag on a project.
- `project_id`, `user_id` (who flagged), optional `ship_id`, `review_stage` (one of `ReviewerNote::REVIEW_STAGES`), `reason` (text).
- While flagged, only admins can see the project's reviews (`*ReviewPolicy#show?` returns false if `record.ship.project.flagged?` for non-admins).
- An admin submitting a decision via `redirect_to_next_or_index` calls `clear_flag_if_admin_override!` which `project.project_flags.destroy_all` — admin override implicitly resolves the flag.
- Flagged-project ships are excluded from `Reviewable.available_for` so reviewers don't see them in the queue.

---

## 5. Identity Gate (`awaiting_identity`)

The "submission held until verified" mechanism:

1. `Projects::ShipsController#create` sets `status: :awaiting_identity` if user not `fully_identity_gated?`.
2. Ship's `after_create :create_initial_reviews!, if: :pending?` → reviews **are NOT** created yet.
3. UI shows the "Submitted!" page with "your submission is on hold" copy. User feels submitted; reviewers see nothing.
4. `HcaIdentityRefreshJob` periodically polls HCA for users with `verification_status != 'verified'` OR `has_hca_address = false` OR `first_name IS NULL` (filtered to those with a stored HCA token). The `first_name IS NULL` clause backfills the name/country cache for users who were already fully gated when that cache was added.
5. `User#refresh_identity_cache!` calls HCA, then `apply_identity_cache!` updates the user's cached identity fields (`verification_status`, `has_hca_address`, `first_name`, `last_name`, `country`). The non-status fields exist so batch jobs (e.g. the user → Airtable cron) can read names/country off the row instead of hitting HCA once per user.
6. If user transitions to `fully_identity_gated?` for the first time: `Ship.promote_awaiting_identity_for(user)` flips all their held ships to `:pending`.
7. The ship's `after_update_commit :create_initial_reviews!, if: :became_pending_from_awaiting?` fires and seeds the reviews.
8. Promotion is **one-way**: `clear_hca_session!` deliberately does NOT demote already-promoted ships, since reviewers may already be working on them.
9. Transient HCA errors → polynomial retry. `HcaService::InvalidToken` (persistent 401/403) → `clear_hca_session!` clears the dead token and stops polling.

---

## 6. Time-Audit Calculations

The TA is responsible for converting raw recording duration into `approved_public_seconds`.

`Ship#compute_approved_public_seconds(annotations)`:
- For each new journal entry's recordings:
  - **Lapse / Lookout**: `duration` is already real-time seconds.
  - **YouTube**: `duration_seconds * stretch_multiplier` (default 1, but a reviewer can set e.g. 60 to treat a YT video as a 1:60 timelapse). Stretch is per-recording in TA annotations and is persisted onto the `YouTubeVideo` row via `sync_youtube_stretch_multipliers!` so that aggregation queries reflect it.
  - Then subtract `removed` segments (full `real_range`) and `deflated` segments (`real_range * deflated_percent / 100`), where `real_range = video_range * multiplier`. The segment `multiplier` is the YouTube `stretch_multiplier` for YT recordings, but a **hardcoded `60.0` for timelapses** — segment start/end are video-position seconds, so a 1s timelapse segment removes 60s of real work. (Gotcha: timelapse base duration is already real seconds, but timelapse *segment* trimming scales by 60. Both `serialize_journal_entry` and `recording_duration` in the reviews base controller mirror this 60.0 factor.)
- Result clamped to ≥ 0.

`Ship#total_hours` (used in admin context) re-computes from kept journal entries via raw SQL summing the per-recordable duration columns, divides by 3600.

`Ship#recompute_status!` mirrors `time_audit_review.approved_public_seconds` onto `ship.approved_public_seconds` **only when the ship transitions to `:approved`** (set inside the same `update!` as the status flip, so `award_ship_review_currency!` sees the populated value). Any transition to a non-approved status clears the column. The TA's own `approved_public_seconds` stays set independently from the moment the TA reviewer approves — that's the per-review record. The ship-level column is the gated, full-pipeline value: `ships.approved_public_seconds > 0` ⇔ ship is fully approved.

`Ship#approved_internal_seconds` (admin-only display) = `approved_public_seconds + design_review.hours_adjustment + build_review.hours_adjustment`. Returns an integer (always); display callers convert to hours and render `nil` when zero.

See [§7 Hours: User-Facing vs Internal](#7-hours-user-facing-vs-internal) for the full taxonomy of the three hour concepts and what each one drives.

---

## 7. Hours: User-Facing vs Internal

The system tracks three distinct hour concepts. They have different audiences, different computation paths, and (most importantly) feed different downstream consumers. Conflating them is the easiest way to introduce a financial bug.

### The three concepts

| Concept | What it represents | Where stored / computed | Who controls it |
|---|---|---|---|
| **Logged time** | What the user *claims* — the raw input from recordings | `Project#time_logged`, `Ship#total_hours` (re-aggregated SQL over recordings) | The user (by uploading timelapses / videos) |
| **User-facing approved time** | The TA-blessed subset of logged time, gated by full-pipeline approval | `ship.approved_public_seconds` (mirrored from `time_audit_review.approved_public_seconds` only when ship reaches `:approved`; cleared otherwise) | The TA reviewer (value), full pipeline (gating) |
| **Internal approved time** | User-facing + Phase 2 adjustments — the *operator's* view | `Ship#approved_internal_seconds` = `approved_public_seconds + design_review.hours_adjustment + build_review.hours_adjustment` | TA + DR + BR reviewers, combined |

Internal approved time is **derived on read** via `Ship#approved_internal_seconds` — there's no column. Display sites (admin controllers) wrap it with a nil-when-zero helper so the UI shows blank instead of "0.0h" before any reviews settle.

### What each one drives

| Consumer | Reads | Notes |
|---|---|---|
| User-visible dashboards (path header, project pages) | User-facing approved (or logged time, if not yet approved) | Never internal — users must not see the adjustment |
| Airtable export (`Project.airtable_sync_preload`) | Logged hours only — "Hours Approved" used to be exported here but was removed; consumers should join from the `Ship.airtable_sync_field_mappings` "Approved Hours" column instead. | Per-project approved totals are no longer denormalized into the Project Airtable row. |
| YSWS Unified Submissions Airtable upload (`Ship#upload_to_unified_airtable!`) | **Internal approved time** (`internal_hours_for_unified` → `approved_internal_seconds / 3600`) | Pushed to "Optional - Override Hours Spent". This is the operator's view (TA + DR/BR adjustments) — what downstream YSWS automation uses as the official hours. |
| **Koi awarding** for DR ships (`ShipKoiAwarder.compute_amount`) | **User-facing approved** | See §10 — explicitly NOT internal. The user's reward must be derivable from what they see. |
| **Gold awarding** for BR ships (`ShipGoldAwarder.compute_amount`) | **User-facing approved** | Same rate (7/hr), same hours basis as koi. BR's own incremental cycle hours only — re-ship cycles award only their delta. |
| Admin hours display (`HoursDisplay` component) | Internal as the headline; user-facing in parens labeled "User facing" | Reviewers see both side-by-side |
| Admin sort/filter on hours columns | Internal | Operator-facing analytics |
| Travel grant payouts | Internal (manually calculated) | Per `mail_intro` content: `$8.5/hour for design + build hours`. Admins compute this off-platform from the internal figure. NOT automated in code today. |
| Currency preview shown to Phase 2 reviewer (DR/BR show pages) | User-facing only — `Math.floor(7 * userFacingHours)` | Preview helper; the real award is computed server-side by `ShipKoiAwarder` / `ShipGoldAwarder` and is the binding number |

### Why `hours_adjustment` exists separately

Phase 2 reviewers (DR/BR) sometimes need to credit or debit hours that the TA can't see — e.g., physical build work not captured on camera, or a deduction for low-quality work that nonetheless passed RC. Putting this knob on Phase 2 keeps roles focused:

- **TA** answers: "Do these recordings reflect real work?" → sets `approved_public_seconds` (the user's contract).
- **Phase 2** (DR/BR) answers: "Given the design/build outcome, what's the *real* hours figure?" → adds `hours_adjustment` for internal/operator use.

Decoupling means Phase 2 can adjust internal totals (driving travel grants) without retroactively changing the user-visible "your approved hours" number — which would feel arbitrary to the user and would invalidate the TA's prior decision.

### Why koi/gold follows user-facing only

The user-facing approved hours figure is **the contract**. What the user sees as "your approved hours" should be the basis for their koi (DR) or gold (BR) reward. Decoupling them would mean the user couldn't audit their own balance from displayed numbers, and would let Phase 2 reviewers silently inflate or deflate the user's primary reward signal under cover of "internal" adjustments.

If Phase 2 wants to adjust the reward specifically (e.g., quality bonus or deduction), the explicit knob is `design_review.koi_adjustment` or `build_review.gold_adjustment` — added on top of the hours-derived base in the respective awarder. This keeps the adjustment **visible and labeled** in the ledger description (`"Ship #X approved — Yh × 7 koi + Z koi review adjustment"`) rather than hidden inside an opaque hours number.

### Quirk: currency preview vs award rounding

The Phase 2 reviewer's currency preview in the DR/BR frontend uses `Math.floor(7 * userFacingHours)` where `userFacingHours` has already been rounded to 1 decimal place. The actual award (`ShipKoiAwarder.compute_amount` / `ShipGoldAwarder.compute_amount`) uses `Rational(seconds * 7, 3600).round` on raw seconds.

These can disagree by 1 unit at certain half-hour boundaries (e.g., exactly 9.5h: preview shows 66, award is 67). Reviewers should treat the preview as approximate. Don't "fix" the preview to match by reading raw seconds — that would tie the reviewer UI to backend rounding policy and make changing either harder. The award is authoritative.

---

## 8. Re-ship Behavior (Critical Edge Cases)

After a ship is `returned` or `rejected`, the user can submit a new one for the same project (the policy block only applies to `pending`/`awaiting_identity` siblings).

### Journal Entry Locking Across Cycles

- `claim_journal_entries!` only claims entries whose `ship_id IS NULL OR ship_id NOT IN (approved_ship_ids)`.
- **Entries on an approved ship are immutable** — they belong to that finalized cycle. The new ship cannot reclaim them.
- Entries on returned/rejected ships ARE reclaimed (their `ship_id` is overwritten).

### `previous_approved_ship` and Cycle Boundaries

- `previous_approved_ship` = the project's most-recent `approved` ship strictly before the current ship's `created_at`.
- `new_journal_entries` = kept entries created after that cutoff, **excluding entries locked to a different approved ship** (`ship_id IS NULL OR ship_id NOT IN other_approved_ids`). This mirrors the `claim_journal_entries!` filter — the compute path (`compute_approved_public_seconds`, koi `member_weights`, the review queues) previously lacked it, so a later ship re-counted hours an earlier ship's TA had reviewed during its review lag (cross-ship double-counting). Returned/rejected ships' entries stay visible so a re-ship reclaims them.
- `lock_reviewed_journal_entries!` runs on the `:approved` transition (in `recompute_status!`): it stamps `ship_id` on the still-unclaimed review-lag entries the TA reviewed, finalizing this cycle's set so later ships exclude it. Safe at approval time because no later ship exists yet. (Backfill for pre-existing ships: `rake ships:fix_hour_overlap`, bounded by `ta.completed_at`; `rake ships:hour_overlap_report` audits impact — read-only.)
- `previous_journal_entries` = kept entries created at-or-before the cutoff.
- Reviewers see both `new_entries` and `previous_entries` in their UI (previous shown for context only). Each serialized entry carries `in_ship` (`journal_entry.ship_id == ship.id`); all four queues (TA/RC/DR/BR) show a "Not part of this ship" pill when false. On TA, non-`in_ship` entries also default to collapsed and are excluded from the per-entry "Done"/all-saved auditing state. The project context exposes both `logged_hours` (project-wide total, used as the `userFacingHours` fallback feeding currency math) and `ship_logged_hours` (`ship.total_hours`, this cycle only, shown as the third figure in the hours display).

### TA Annotation Carry-forward

See `carry_forward_ta_annotations!` above (Section 2). The key win: a re-ship where the user only added images/text but no new recordings → TA auto-approves and the user only waits for RC + Phase 2.

### Multiple Re-ships in Quick Succession

If a user submits ship A, gets returned, fixes, submits ship B → ship A is in terminal `returned` state (still has its history). Ship B claims entries from after the previous-**approved** cutoff (which is unchanged because A was returned, not approved). Both A and B coexist in the DB as separate rows — A's reviews stay in their terminal states forever as audit trail.

---

## 9. Notifications

`MailDeliveryService.ship_status_changed(ship)` (called by Ship's `after_update_commit`) creates an in-app `MailMessage`:
- `approved` → "Your ship for X was approved!" (+ feedback if present), action_url to project.
- `returned` → "Your ship for X was returned. Your submission needs changes." (+ aggregated feedback), action_url to project.
- `rejected` → "Your ship for X was not accepted." (+ feedback). No action_url (terminal).

The `notify_status_change` callback is wrapped in `rescue => e` and logs but doesn't re-raise — a notification failure shouldn't roll back the review decision.

---

## 10. Koi/Gold Economy

The dual-currency model maps directly onto Phase 2: **DR → koi**, **BR → gold**. The first approved BR per project also triggers a **koi → gold sweep** of accumulated project-koi (the "built irl" conversion).

### Currency Surface

Three currencies referenced in code:
- **koi** — earned via DR (design ship approval) and streak goals. Spent on koi-currency shop items + project grants. Convertible to gold when a project becomes built-irl.
- **gold** — earned via BR (build ship approval) and the built-irl conversion sweep. Also credited by admin adjustment. Spent on `currency = "gold"` shop items. Premium currency; *not* spendable on project grants.
- **hours** — pseudo-currency on shop items. Cannot be purchased directly (`ShopOrder#user_can_afford` errors with "This item cannot be purchased directly"). Likely a placeholder for hours-redeemable rewards.

### Models

`KoiTransaction` (`app/models/koi_transaction.rb`):
- `user_id`, `actor_id` (nullable — nil for system-generated awards), `amount` (signed integer, validated `other_than: 0`), `reason` (string, must be one of `REASONS = %w[ship_review built_irl_conversion admin_adjustment streak_goal]`), `description` (text, required), `ship_id` (required for `SHIP_REASONS = %w[ship_review built_irl_conversion]`, forbidden otherwise — see `ship_id_consistency` validation), `transfer_id` (uuid, set on the koi side of a transfer pair; see "Built-IRL Conversion" below).
- **Readonly after creation**: `before_update { raise ActiveRecord::ReadonlyRecord }` and same for destroy. Records are the canonical history — never mutated.
- Has `user_id, created_at` composite index for fast per-user history queries.

`GoldTransaction` (`app/models/gold_transaction.rb`):
- Same shape as KoiTransaction but with `REASONS = %w[ship_review built_irl_conversion admin_adjustment]` (no streak source; streak rewards are koi-only). Also has `ship_id` (with the same `SHIP_REASONS` consistency rule) and `transfer_id`.
- **No denormalized balance** — gold is recomputed live from the ledger by `User#gold`, exactly like koi (the old `users.gold_balance` counter cache and its `after_create`/ShopOrder/ProjectGrantOrder callbacks were removed). Record gold only via `GoldTransaction.create!`.

### Balance Calculation (`User#koi`, `User#gold`)

```ruby
def koi
  return 0 if trial?
  koi_transactions.sum(:amount) -
    shop_orders.joins(:shop_item).where(shop_items: { currency: "koi" })
               .where.not(state: :rejected).sum("frozen_price * quantity") -
    project_grant_orders.kept.where.not(state: :rejected).sum(:frozen_koi_amount)
end

def gold
  return 0 if trial?
  gold_transactions.sum(:amount) -
    shop_orders.joins(:shop_item).where(shop_items: { currency: "gold" })
               .where.not(state: :rejected).sum("frozen_price * quantity") -
    project_grant_orders.kept.where.not(state: :rejected).sum(:frozen_gold_amount)
end
```

**Koi balance** = sum of ledger amounts (including negative `built_irl_conversion` debits) MINUS reservations from non-rejected koi-currency shop orders MINUS reservations from non-rejected project grant orders.

**Gold balance** is computed the same way as koi — sum of `GoldTransaction` amounts MINUS non-rejected gold-currency shop orders MINUS non-rejected project grant orders' `frozen_gold_amount`. Rejecting an order auto-refunds (it drops out of the sum); there is no counter to maintain.

**Trial users always have 0** — they cannot earn or spend.

**Why exclude only `rejected`** (not also `pending`):
- A `pending` shop order or project grant withholds koi from the user's spendable balance. They cannot double-spend while waiting on admin fulfillment.
- A `fulfilled` order remains in the deduction (cost was paid).
- A `rejected` order refunds — excluded from deduction → user gets balance back.
- A `fulfilled → rejected` transition (e.g., admin reverses a fulfilled grant) refunds koi to the user via this calculation. **It does NOT automatically claw back HCB money** (per a comment in `ProjectGrantOrder`) — that's manual reconciliation through the admin "Record adjustment" flow.

### Awarding Sources

| Currency | Reason | Created by | Notes |
|---|---|---|---|
| koi | `streak_goal` | `StreakService.check_goal_completion` | `GOAL_KOI_REWARDS = { 3 => 1, 5 => 2, 7 => 5, 14 => 12 }` |
| koi | `admin_adjustment` | `Admin::KoiTransactionsController#create` | Hard-coded reason; `actor` set to `current_user`. Admin-only via `require_admin!`. |
| koi | `ship_review` | `ShipKoiAwarder.call(ship)` from `Ship#award_ship_review_currency!` | DR ships only. See below. |
| koi | `built_irl_conversion` | `BuiltIrlConversionService.call(ship)` (NEGATIVE amount, koi debit side of a transfer pair) | Paired with a gold credit row by `transfer_id`. |
| gold | `admin_adjustment` | `Admin::KoiTransactionsController#create` (with `?currency=gold`) | Manual admin grant. The single koi controller switches between `KoiTransaction`/`GoldTransaction` via `current_currency` — there is no separate gold controller. |
| gold | `ship_review` | `ShipGoldAwarder.call(ship)` from `Ship#award_ship_review_currency!` | BR ships only. |
| gold | `built_irl_conversion` | `BuiltIrlConversionService.call(ship)` (POSITIVE amount, gold credit side of a transfer pair) | Paired with a koi debit row by `transfer_id`. |

### Ship Review Awarding (DR koi + BR gold)

When a ship's status transitions to `:approved`, `Ship#award_ship_review_currency!` (an `after_update_commit` callback gated by `saved_change_to_status?`) dispatches by `ship_type`:
- `ship_type_design?` → `ShipKoiAwarder.call(self)`
- `ship_type_build?`  → `ShipGoldAwarder.call(self)` AND `BuiltIrlConversionService.call(self)`

Both awarders are the single source of truth for their currency's formula. Each splits the total **per-contribution** across non-trial kept project members — proportional to each member's attributed seconds this cycle (`ShipKoiAwarder.member_weights`, the same per-entry attribution used for user-facing hours); the project owner absorbs any integer rounding remainder. A member who logged no contribution this cycle receives 0 and gets no ledger row. When no member has any attributed seconds (e.g. an adjustment-only award), it falls back to an even split.

**Formula (both same shape, only adjustment column and partial unique index differ):**
```
koi  = round(approved_public_seconds * 7 / 3600) + design_review.koi_adjustment
gold = round(approved_public_seconds * 7 / 3600) + build_review.gold_adjustment
```

**Hours basis**: `ship.approved_public_seconds` — the **public/user-facing** TA value. The internal `hours_adjustment` columns on DR/BR are deliberately NOT counted toward the currency (they only affect internal hours reporting). The rate is **7 per hour** for both currencies (`ShipKoiAwarder::RATE_KOI_PER_HOUR` / `ShipGoldAwarder::RATE_GOLD_PER_HOUR`).

**Adjustments**: `design_review.koi_adjustment` and `build_review.gold_adjustment` are signed integer knobs the Phase 2 reviewer can set. Each only feeds its own currency — DR adjustment never affects gold, BR adjustment never affects koi.

**Re-ship correctness**: `ship.approved_public_seconds` is set by TA from `compute_approved_public_seconds(annotations)` over `new_journal_entries` only — entries created strictly after the previous approved ship's `created_at`. Each cycle records exactly the *new* hours. Re-ship BRs award gold for their incremental hours but do NOT re-trigger the built-irl conversion (the conversion is one-shot per project; see below).

**Result tagging**: Each `.call` returns an array of `Result`s (one per member) with `status:` one of `:created`, `:skipped_already_awarded` (DB unique index rejected — race or replay), `:skipped_zero_amount`, `:skipped_trial_user`, `:skipped_not_approved`, `:skipped_wrong_ship_type` (koi awarder skips build ships, gold awarder skips design ships).

### Built-IRL Conversion

When a build ship reaches `:approved` for the **first time on a project**, `BuiltIrlConversionService.call(ship)` runs alongside `ShipGoldAwarder`. The trigger:

```ruby
other_built = ship.project.ships.approved
                  .where(ship_type: :build)
                  .where.not(id: ship.id).exists?
# Skip conversion if there's already a prior approved BR — sweep is one-shot.
```

`Project#built_irl?` is the AR-generated predicate over the **user-declared `built_irl` boolean column** (set on the project edit page). It is what drives `ship_type` at submission (`true` → build ship). It is NOT derived from approved build ships — the "first approved BR" trigger above is computed independently in the conversion service via the `other_built` existence query.

**Per-member formula**:
```
m_lifetime_koi = sum(KoiTransaction.where(
                       reason: 'ship_review',
                       user_id: m.id,
                       ship_id: project.ship_ids).amount)
convertible    = min(m.koi_balance_now, m_lifetime_koi)
```

The `min(balance_now, project_lifetime_award_cap)` formula is **hindsight-optimal for max-gold attribution of past spending** (see proof below). It naturally enforces "non-project koi (streak / admin) never converts" — because non-project sources fall outside the project's award cap.

**Why min(balance, project_award_cap) is hindsight-optimal**: With one project P and one non-project source S (e.g. streak), let `spent` = total spent so far:
- If `spent ≤ S_award` (no overflow): user balance includes the full `P_award`, so `min(balance, P_award) = P_award`. Convert everything P awarded.
- If `spent > S_award` (overflow into P): user balance after spending = `P_award + S_award - spent` = `P_remaining`. So `min(balance, P_award) = P_remaining`. Convert what's left of P.

In both cases this matches "attribute past spending to S first, then to P" — the assignment that maximizes convertible-from-P. Generalizes to multiple projects + streak; total gold awarded across the project lifecycle is provably maximal.

**Ledger writes**: Inside a single transaction with a generated `transfer_id = SecureRandom.uuid`:
```ruby
KoiTransaction.create!(user: m, ship: br_ship, amount: -convertible,
                       reason: 'built_irl_conversion', transfer_id:, description: ...)
GoldTransaction.create!(user: m, ship: br_ship, amount: +convertible,
                        reason: 'built_irl_conversion', transfer_id:, description: ...)
```

Both sides share the `transfer_id` so auditors can pair them via `WHERE transfer_id = ?` without a cross-table FK.

**Idempotency**: Partial unique indexes on `koi_transactions(ship_id, user_id) WHERE reason = 'built_irl_conversion'` and `gold_transactions(ship_id, user_id) WHERE reason = 'built_irl_conversion'` guarantee one koi/gold pair per (BR ship, member). The service rescues `ActiveRecord::RecordNotUnique` and returns `:skipped_already_converted`.

**Per-member, not per-project**: a multi-member project's first BR triggers a separate conversion attempt for each non-trial kept member; each member's `convertible` is capped by *their* slice of DR awards for the project.

**Result tagging**: `:converted`, `:skipped_already_converted`, `:skipped_zero_amount`, `:skipped_trial_user`, `:skipped_not_approved`, `:skipped_wrong_ship_type`, `:skipped_not_first_build`.

**BR show preview**: The BR reviewer sees `Approval will convert N koi → N gold` below "Modify Gold" when this approval would be the first build for the project AND `BuiltIrlConversionService.compute_amount(ship, project.user) > 0`. The preview shows the project owner's convertible amount; collaborators get their own conversion at the same trigger.

#### Layered safeguards (financial-grade)

Both koi and gold flow downstream into HCB grant orders / premium rewards. Independent layers prevent double-issuance:

1. **`saved_change_to_status?` callback gate** — the `after_update_commit` only fires when `status` actually changed. Editing `justification`, `feedback`, or any non-status field on an approved ship will NOT re-trigger awards or conversions.
2. **`Ship#status_transition_allowed` validation** — blocks transitions out of `approved`/`returned`/`rejected`. Prevents Rails-mediated re-approval.
3. **KoiTransaction / GoldTransaction are read-only** — `before_update` and `before_destroy` raise `ActiveRecord::ReadonlyRecord`. The ledger cannot be wiped to "reset" deduplication.
4. **Partial unique indexes** — at the DB layer:
   - `koi_transactions(ship_id, user_id) WHERE reason = 'ship_review'` (one DR koi award per member per ship)
   - `koi_transactions(ship_id, user_id) WHERE reason = 'built_irl_conversion'` (one conversion debit per member per BR ship)
   - `gold_transactions(ship_id, user_id) WHERE reason = 'ship_review'` (one BR gold award per member per ship)
   - `gold_transactions(ship_id, user_id) WHERE reason = 'built_irl_conversion'` (one conversion credit per member per BR ship)

   These are the absolute guarantees. Awarders/conversion service rescue `RecordNotUnique` and return `:skipped_already_*`.
5. **`ship_id_consistency` validations** on both transaction models — enforce `reason ∈ SHIP_REASONS ⟺ ship_id present`, blocking malformed inserts.
6. **First-BR check in conversion service** — `BuiltIrlConversionService` early-returns `:skipped_not_first_build` if another approved BR exists on the project, so re-ship BRs don't trigger another sweep. The check + writes run inside `ship.project.with_lock` (pessimistic SELECT FOR UPDATE on the project row) so two concurrent BR approvals on the same project serialize — the second one sees the first's effect and returns `:skipped_not_first_build` cleanly.

#### Failure handling

Any error inside the callback is caught, logged, and reported to `ErrorReporter`. The ship's approval is NOT rolled back — fail-open preserves the reviewer's decision. For DR-koi misses, operators close the gap via `rake koi:reconcile_ship_reviews APPLY=1`. **No equivalent reconcile task exists for BR gold or conversions today** — since BR is brand new and no projects have been built-irl in production yet, a backfill task wasn't built. If gaps appear, build one mirroring the koi rake.

**Zero-amount transactions are skipped**: both transaction models validate `amount: { other_than: 0 }`. If hours-derived currency exactly cancels with a negative adjustment, no transaction is created and the result is `:skipped_zero_amount`.

#### Reconciliation rake task (koi only)

`rake koi:reconcile_ship_reviews` (in `lib/tasks/koi.rake`) is the operator tool for backfilling missed DR koi awards or recovering from callback failures. Covers DR koi only — BR gold + conversions are not reconciled today.

- **Default mode is dry-run**: prints what would be issued without inserting.
- `APPLY=1` to actually issue.
- `SINCE=YYYY-MM-DD` filters by `ships.updated_at` (which on an approved ship is approximately the approval time).
- `EXCLUDE_SHIP_IDS=1,2,3` skips specific ships (e.g., suspected gaming, banned users).
- Output: per-recipient totals, grand koi total, top-10 recipients, per-ship breakdown (first 50). No HCB/USD values are printed — operator does that conversion separately.
- Always idempotent — safe to run multiple times. Layer 4 absorbs duplicates.

If you change the rate (currently `7`) or the source-of-truth field (currently `approved_public_seconds`), update both this doc and the user-visible documentation under `docs/`. **Historical Koi/Gold transactions are immutable** — a rate change does NOT retroactively re-award; rerunning any reconcile task will skip already-awarded ships via layer 4.

### Where Balance Is Surfaced

- `Path` header: `current_user.koi` (from `path_controller.rb#index`).
- `/shop` index: `koi_balance: current_user.koi` (from `shop_items_controller.rb`).
- Project grants: `koi_balance: current_user.koi` on the new/index pages.
- Shop order new: balance shown in the chosen currency (`gold` if item is gold-priced, else koi).
- Admin pages: `/admin/koi_transactions` (per-user filterable history), `/admin/koi_transactions/new` (manual adjustment form). The same controller/pages serve gold via `?currency=gold` (`current_currency` swaps the model) — there is no separate gold transactions controller or page.
- API: `/api/v1/users/me` includes `koi: user.koi`.

### Spending: Shop Orders

`ShopOrder` (`app/models/shop_order.rb`):
- `frozen_price` snapshotted from `shop_item.price` on create (so price changes don't retroactively affect orders).
- `state` enum: `pending`, `fulfilled`, `rejected`, `on_hold`.
- `before_validation :freeze_price, on: :create`.
- `validate :user_can_afford, on: :create` — checks the right currency balance.
- Encrypts `phone` and `address` (PII of minors) at rest, non-deterministic.
- `requires_shipping` items require `address` + `phone` validation.

### Spending: Project Grants

`ProjectGrantOrder` (`app/models/project_grant_order.rb`) — the koi/gold → real USD path via HCB.
- User specifies `frozen_usd_cents`; `before_validation :snapshot_cost_from_usd` derives the total currency cost from `HcbGrantSetting.current.koi_for_usd_cents(usd_cents)` (rounded UP — user pays the ceiling), then splits it **koi-first, gold-second** (1 koi = 1 gold) into `frozen_koi_amount` / `frozen_gold_amount`. Affordability checks `koi + gold >= total`.
- Both portions refund automatically on reject — `User#koi` and `User#gold` are recomputed live from their ledgers and exclude rejected orders, so no deduct/refund callbacks are needed.
- `HcbGrantSetting` stores `koi_to_cents_numerator` (default 500) / `koi_to_cents_denominator` (default 7) → 7 koi = $5 = 500 cents (so 1 koi ≈ $0.71).
- Soft-deletable (`include Discardable`).
- States mirror `ShopOrder`: pending, fulfilled, rejected, on_hold.
- **Cannot be hard-destroyed** — `destroy` raises. Financial data preserved.
- Trial users blocked at validation level.
- `fulfilled → rejected` transition allowed and refunds koi (via the `where.not(state: :rejected)` exclusion in `User#koi`).

For the full ledger system (settle service, card lifecycle including closure refunds, divergence detection, admin UI scoping), see [arch-hcb-ledger.md](arch-hcb-ledger.md).

### Trial-user Suppression

Both `User#koi` and `User#gold` short-circuit to `0` for trial users. `ShopOrder#user_can_afford` short-circuits if `user.trial?` because trial users are blocked at the policy layer (`ShopOrderPolicy` requires `!user.trial? && user.fully_identity_gated? && Flipper.enabled?(:shop, user)`).

---

## 11. Concurrency & Safety Edge Cases

| Risk | Mitigation |
|---|---|
| Two reviewers grabbing the same review | `atomic_claim!` single-UPDATE WHERE guard returns true on success only |
| Reviewer's claim expiring mid-edit | Frontend heartbeat every 2min (10min TTL); if returns 409, edit fails policy check (no active claim) |
| Stale data on review save | `lock_version` optimistic locking on each Reviewable |
| Ship status drift if review status saved but ship not recomputed | `after_save` (not after_commit) `recompute_ship_status!` runs in same transaction |
| Phase 2 review created twice | `validates :ship_id, uniqueness: true` per-review-type; `find_or_create_by!` in `ensure_phase_two_review!` |
| TA approved but ship still pending | `recompute_status!` wraps `ship.with_lock { ensure_phase_two_review!; recompute_status! }` — both happen atomically |
| User submits twice rapidly | `ProjectPolicy#ship?` blocks while a `pending`/`awaiting_identity` ship exists |
| Preflight job spam | `#run` cancels existing running PreflightRuns before creating a new one |
| Identity gate flapping | Promotion is one-way; `clear_hca_session!` does not demote |
| Project flag mid-review | `available_for` excludes flagged ships from queues; `*ReviewPolicy#show?` blocks non-admin view |
| Admin overriding terminal status | `Ship#status_transition_allowed` model validation prevents it; `ShipPolicy#update?` is `admin?` only but the validation still fires |
| YouTube stretch_multiplier race with hours aggregation | TA annotation is the source of truth; `sync_youtube_stretch_multipliers!` runs inside `recompute_status!` before the column is populated on the `:approved` transition, so aggregation queries see the right value |
| Notification failure rolling back review | `notify_status_change` rescues all exceptions and logs; review save commits regardless |

---

## 12. Frontend Pages (Reviewer)

| Path | Purpose |
|---|---|
| `pages/admin/reviews/time_audits/{index,show}.tsx` | TA queue + review UI with timeline + segment annotation |
| `pages/admin/reviews/requirements_checks/{index,show}.tsx` | RC queue + repo tree viewer (refresh via `refresh_tree`) |
| `pages/admin/reviews/design_reviews/show.tsx` | DR queue (Phase 2 design ships) |
| `pages/admin/reviews/build_reviews/show.tsx` | BR queue (Phase 2 build ships). Shows "Approval will convert N koi → N gold" preview below the Modify Gold field when this would be the project's first approved BR and the owner has koi to convert. |
| `pages/admin/koi_transactions/{index,new}.tsx` | Admin koi **and gold** ledger + manual adjustment form — the `currency` prop (`?currency=gold`) switches the page between the two. No separate gold pages exist. |

Each show page polls heartbeat and listens for 409 to surface "claim lost" UX.

---

## 13. Open Questions / Watch Items

- **No reconciliation rake task for BR gold or built-irl conversions** — only DR koi is reconciled today via `rake koi:reconcile_ship_reviews`. Acceptable while BR is brand new and no projects are built-irl in production. If gaps appear post-launch, build parallel tasks (e.g. `rake gold:reconcile_ship_reviews`, `rake gold:reconcile_built_irl_conversions`) mirroring the koi rake.
- **`ship_type` at submission** — resolved: `ship_type` is now set from the project's user-declared `built_irl` flag at submission (`@project.built_irl? ? :build : :design`), so users submit BR ships by marking the project built-irl on the edit page. Admin swap (`Ship#swap_phase_two_type!`) remains for correcting a mis-typed ship in review.
- **No user-facing notification on built-irl conversion** — `MailDeliveryService.ship_status_changed` notifies users on ship approval but does not call out the koi → gold sweep specifically. Worth adding a dedicated message so users understand the balance shift.
- **Project grant orders use koi only** — gold is not spendable on HCB-backed project grants. By design today; revisit if gold should also be redeemable for real USD.
- **Awaiting-identity ships** create no reviews and are invisible to reviewers — but they DO count toward `ProjectPolicy#ship?`'s "pending submission" lock. The user can't ship a different project if they have an awaiting-identity submission on another (intentional? worth confirming).
- The `feedback` text on a `returned` ship is **a snapshot at the moment of return**. If a reviewer later changes their mind and reopens (which they can't — terminal), the message wouldn't update. Consider this when reading old MailMessages.
