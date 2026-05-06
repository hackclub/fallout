---
name: Path & Gamification Architecture
description: The Path progression system, critter gacha rewards, koi economy (placeholder), clearing gallery, and admin review workflow
type: project
originSessionId: bb8ce051-7e1a-4ccd-bd96-7b3a575d339a
---
# The Path & Gamification

The Path is the primary user-facing experience — a 3D perspective ground plane where students progress by creating journal entries. Each entry earns a critter (gacha reward) and advances the user along the path.

## The Path — `app/controllers/path_controller.rb`

Single `index` action at `/path`. Trial users can access (`allow_trial_access`).

**Props passed to frontend:**
- `display_name`, `email`, `koi` (always 0), `avatar`
- `has_projects` — whether user owns or collaborates on any project
- `journal_entry_count` — number of kept journal entries
- `critter_variants` — array of variant strings per journal entry (creation order)

### Progression Logic (frontend)

**`activeIndex`** = `has_projects ? journal_entry_count + 1 : 0`

60 billboard nodes on the path:
- **Index 0** (star node): `active` → links to `/projects/onboarding`; `completed` → notification
- **Index 1+** (journal nodes): `active` → links to `/journal_entries/new`; `completed` → shows critter image overlay
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
| `Path.tsx` | 3D scene — billboards, grass, scroll, curvature math (524 lines) |
| `PathNode.tsx` | Individual node — state logic, tooltip, ModalLink for detail |
| `Header.tsx` | Top HUD — avatar, display name, koi balance, sign-out dropdown |
| `Leaderboard.tsx` | Placeholder — "Coming Soon" |
| `BgmPlayer.tsx` | Background music toggle |
| `SignUpCta.tsx` | Trial user upgrade prompt |

## Critters — `app/models/critter.rb`

Gacha rewards earned from creating journal entries.

**18 variants**: `b2b-sales, bloo, bush, chocolate, elk, grass, gren-frog, jellycat, orange, riptide, rosey, skeelton, sungod, the-goat, the-red, trashcan, worm, yelo`

**Fields:**
- `variant` — random from `VARIANTS.sample`
- `spun` — boolean, default false (whether reveal animation played)
- `user_id`, `journal_entry_id`

**Award flow** (`JournalEntriesController#maybe_award_critter`):
1. Check `current_user.can_earn_critter?` (returns `!trial?`)
2. Create Critter with random variant
3. Redirect to `/spin/:critter_id` for reveal animation

**Policy**: show/update restricted to owner only.

### Critter Reveal — `app/controllers/critters_controller.rb`

- `GET /spin/:id` → plays `/spin_animation.mp4`, reveals critter image after 1.6s
- `PATCH /spin/:id` → marks critter as `spun: true`
- Options: replay animation or visit the Clearing

### The Clearing — `app/controllers/clearing_controller.rb`

Gallery view at `/clearing` showing all user's critters in a scenic environment.
- Blue-noise distributed placement algorithm
- Links to individual `/spin/:id` for each critter
- "Back" link returns to `/path`

## Koi Economy

Implemented as a ledger. See [arch-ship-and-koi.md](arch-ship-and-koi.md) for the full model. Quick reference:

- `KoiTransaction` (readonly, `REASONS = ship_review | admin_adjustment | streak_goal`) and parallel `GoldTransaction` (admin_adjustment only).
- `User#koi` = `koi_transactions.sum(:amount)` MINUS koi-currency shop_orders (non-rejected) MINUS project_grant_orders (non-rejected). Trials hardcoded to 0.
- All three reasons are wired: `streak_goal` (StreakService), `admin_adjustment` (Admin::KoiTransactionsController), `ship_review` (Ship's after_update_commit → ShipKoiAwarder service). See arch-ship-and-koi.md §10 for the awarding formula and the layered safeguards (DB partial unique index, model invariant, reconciliation rake task).
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

`ClearingController` supports a `?simulate` param in development that renders all 18 critter variants as mock data — useful for testing the gallery layout without creating real journal entries.

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
