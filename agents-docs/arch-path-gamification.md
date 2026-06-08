---
name: Path & Gamification Architecture
description: The Path progression system, critter gacha rewards, koi/gold economy, clearing gallery, and admin review workflow
type: project
originSessionId: bb8ce051-7e1a-4ccd-bd96-7b3a575d339a
---
# The Path & Gamification

The Path is the primary user-facing experience — a 3D perspective ground plane where students progress by creating journal entries. Each entry earns a critter (gacha reward) and advances the user along the path.

## The Path — `app/controllers/path_controller.rb`

Single `index` action at `/path`. Trial users can access (`allow_trial_access`).

**Props passed to frontend:**
- `user` — nested object: `id`, `display_name`, `koi`, `gold`, `avatar` (no email/PII)
- `has_projects` — whether user owns or collaborates on any project
- `journal_entry_count` — number of kept journal entries (owned + collaborated)
- `critter_variants` — array of variant strings per journal entry (creation order), nil where no critter was awarded
- `pending_dialog` — key of the next campaign dialog overlay to show (`sixty_hours`, `streak_goal_completed`, `first_journal`, `streak_goal_nudge`), or nil
- `mail_intro_id` — id of a mail to auto-open on load, or nil

Also exposes `has_unread_mail`, `current_streak`, and `unsubmitted_hours` via path-scoped `inertia_share`.

### Progression Logic (frontend, `app/frontend/pages/path/index.tsx`)

**`activePathNodeIndex`** = `has_projects ? Math.min(journal_entry_count + 1, pathNodeCount - 1) : 0`

**`pathNodeCount`** = `Math.max(50, 50 + journal_entry_count)` — minimum 50 nodes, grows so there's always at least one locked node ahead. (PathNode itself derives its own `activeIndex = has_projects ? journal_entry_count + 1 : 0` for state.)

Nodes on the path:
- **Index 0** (star node): `active` → `<Link>` to `/projects/onboarding`; `completed` → notification
- **Index 1+** (journal nodes): `active` → `ModalLink` to `/journal_entries/new` (trial users / docs-nudge get a notification instead); `completed` → shows critter image overlay
- States: `locked` (future), `active` (next to complete), `completed` (past)

### 3D Rendering

Pure CSS 3D transforms + canvas — **not Three.js**. See [test-page-architecture.md](test-page-architecture.md) for full implementation details.

Key architecture:
- `rotateX(60deg)` ground plane with `perspective: 800px`
- Two-layer billboard system (front/back) for depth sorting with hill cover div between them
- Canvas-based grass sprites with manual 2D perspective projection matching CSS math
- Native scroll drives position — spacer div creates scroll height, fixed viewport floats over it
- All updates bypass React via refs + `requestAnimationFrame` — React renders once on mount
- Planet curvature via `translateZ(-d²/2R)` — billboards sink below horizon at distance
- O(1) culling with `display: none` for off-screen billboards

### Path Components (`app/frontend/components/path/`)

| Component | Purpose |
|---|---|
| `Path.tsx` | 3D scene — billboards, grass, scroll, curvature math (~1030 lines); takes `nodes` + `introTransition` props |
| `PathNode.tsx` | Individual node — state logic, tooltip, Link/ModalLink for active node |
| `Header.tsx` | Top HUD — avatar, display name, koi + gold balance, sign-out dropdown |
| `Leaderboard.tsx` | Placeholder — "Coming Soon" |
| `BgmPlayer.tsx` | Background music toggle |
| `SignUpCta.tsx` | Trial user upgrade prompt |
| `PathDialogOverlay.tsx` | Campaign dialog/cutscene overlay (mascot, stepped text, choices) driven by `pending_dialog` |
| `SubmissionCountdown.tsx` | Countdown HUD to submission deadline |

## Critters — `app/models/critter.rb`

Gacha rewards earned from creating journal entries.

**Variants are derived at boot from the image files in `public/critters/*.webp`** — not a hardcoded list. `Critter::ALL_VARIANTS` is the sorted list of basenames; `SHINY_VARIANTS` are those prefixed `shiny-`; `VARIANTS` is the non-shiny remainder. Adding/removing a `.webp` changes the pool. `validates :variant, inclusion: { in: ALL_VARIANTS }`.

**Shiny rolls**: `Critter.roll_variant` picks a `SHINY_VARIANTS.sample` with probability `SHINY_CHANCE` (0.05), otherwise `VARIANTS.sample`. `critter.shiny?` checks the prefix.

**Fields:**
- `variant` — set via `Critter.roll_variant`
- `spun` — boolean, default false (whether reveal animation played)
- `user_id`, `journal_entry_id`

**Helpers**: `image_path` → `/critters/<variant>.webp`; `audio_path` → per-variant `/sfx/spin/<variant>.mp3` falling back to `default.mp3`; `mark_spun!`.

**Live updates**: includes `Broadcastable`; `broadcasts_updates_to { "path_user_#{user_id}" }` so the owner's path page re-hydrates `critter_variants` on change.

**Award flow** (`JournalEntriesController#maybe_award_critter`):
1. Check `user.can_earn_critter?` (returns `!trial?`)
2. `user.critters.create!(variant: Critter.roll_variant, journal_entry:)`
3. Also awards critters to journal-entry collaborators (`award_critters_to_collaborators`)
4. On create, the controller redirects to `critter_path(critter)` (`/spin/:id`) for reveal; otherwise back to the path or project

**Policy** (`CritterPolicy`): show/update restricted to owner only; scope resolves to the user's own critters.

### Critter Reveal — `app/controllers/critters_controller.rb`

- `GET /spin/:id` → plays `/spin_animation.mp4`, reveals critter image after 1.6s
- `PATCH /spin/:id` → marks critter as `spun: true`
- Options: replay animation or visit the Clearing

### The Clearing — `app/controllers/clearing_controller.rb`

Gallery view at `/clearing` showing all the user's critters (`policy_scope(Critter)`, newest first) in a scenic environment.
- Blue-noise distributed placement algorithm
- Links to individual `/spin/:id` for each critter
- "Back" link returns to `/path`

## Koi Economy

Implemented as a ledger. See [arch-ship-and-koi.md](arch-ship-and-koi.md) for the full model. Quick reference:

- `KoiTransaction` (readonly, `REASONS = ship_review | built_irl_conversion | admin_adjustment | streak_goal`; `SHIP_REASONS = ship_review | built_irl_conversion` require a `ship_id`) and parallel `GoldTransaction` (`REASONS = ship_review | built_irl_conversion | admin_adjustment`).
- `User#koi` = `koi_transactions.sum(:amount)` MINUS koi-currency shop_orders (non-rejected) MINUS project_grant_orders (kept, non-rejected). Trials hardcoded to 0. `User#gold` returns the `gold_balance` integer column directly (trials 0) — see arch-ship-and-koi.md for how gold reconciles against `GoldTransaction`.
- Reasons are wired: `streak_goal` (StreakService), `admin_adjustment` (Admin::KoiTransactionsController), `ship_review` / `built_irl_conversion` (Ship's after_update_commit → awarder service). See arch-ship-and-koi.md §10 for the awarding formula and the layered safeguards (DB partial unique index, model invariant, reconciliation rake task).
- Spending paths: `ShopOrder` (frozen_price, currency koi/gold/hours), `ProjectGrantOrder` (koi → USD via HcbGrantSetting for HCB project funding cards). Both use frozen amounts and exclude `rejected` from the deduction (so `fulfilled→rejected` refunds).

## Admin Review Workflow

See [arch-ship-and-koi.md](arch-ship-and-koi.md) for the full pipeline. Quick reference:

- 4-stage pipeline: Phase 1 = TimeAuditReview + RequirementsCheckReview (parallel, both required). Phase 2 = DesignReview OR BuildReview depending on `ship.ship_type`, created only after Phase 1 approves.
- All reviews share the `Reviewable` concern (claim system with 5min TTL, atomic claim, heartbeat, lock_version, terminal-status protection).
- Reviewer roles: `time_auditor`, `requirements_checker`, `pass2_reviewer` (gates Phase 2). Plus `admin` (everything) and `hcb` (real-money gate, separate).
- Per-type queues: `/admin/reviews/{time_audits,requirements_checks,design_reviews,build_reviews}`. Catch-all summary at `/admin/reviews` (Admin::ShipsController).
- Status transitions on Ships and Reviewables are model-validated against terminal states — admins can't bypass via direct edit; they must go through the pipeline.
- `MailDeliveryService.ship_status_changed(ship)` fires after_update_commit on status change.

## Notifications — `app/models/mail_message.rb`

In-app notification system (not email — confusingly named "mail").

**Features:**
- Broadcast or targeted (single user, role-based, activity-filtered)
- Optional expiration (`expires_at`)
- Dismissable and pinnable
- `MailInteraction` tracks read/dismissed per user

**Filters** (JSON column): `roles`, `joined_before/after`, `has_projects`, `has_ships_with_status`, `user_ids`

**Delivery triggers:**
- `MailDeliveryService.ship_status_changed(ship)` — on review status change
- `MailDeliveryService.collaboration_invite_sent(invite)` — on invite creation (non-dismissable)

**Controller (`app/controllers/mails_controller.rb`):**
- Uses default auth chain (no `allow_trial_access`, no `allow_unauthenticated_access`) — **full HCA authentication required**
- `index` — `policy_scope(MailMessage)`, ordered by pinned then created_at. Tracks read/dismissed state per user.
- `show` — finds message, authorizes, auto-marks as read via `MailInteraction`
- `dismiss` — marks message dismissed via `MailInteraction`
- `read_all` — bulk mark-all-read. Uses `skip_authorization` (operates on user's own interactions only, not a model-level action)

**Frontend**: `/mails` inbox with mark-all-read and individual dismiss.

### The Clearing Dev Mode

`ClearingController` supports a `?simulate` param in development that renders all `Critter::ALL_VARIANTS` as mock data — useful for testing the gallery layout without creating real journal entries.

## Notifications Detail — `app/models/mail_interaction.rb`

Tracks per-user state for each MailMessage:
- `read_at` — when user opened the message
- `dismissed_at` — when user dismissed it
- Unique constraint: `(mail_message_id, user_id)`
- Scopes: `.read` (read_at present), `.dismissed` (dismissed_at present)

## RSVP System

Public form at `POST /rsvp` (`RsvpsController`):
- `allow_unauthenticated_access` + no Pundit (public endpoint)
- Validates email format
- Posts to Airtable table via API
- Stores IP address + email
- Rate-limited: 5/min per IP
- Dismissable banner on landing page (localStorage)
