---
name: Bulletin Board
description: The public community hub at /bulletin_board — bulletin events lifecycle, admin event management, ActionCable live-update wiring, and how it composes with the Explore feed
type: project
---

# Bulletin Board

The Bulletin Board (`/bulletin_board`) is the program's public community hub: a single Inertia page that combines admin-curated **events** (announcements, kickoffs, deadlines) with the **Explore** discovery feed of community projects/journals. Unauthenticated and trial users have full read access. The two surfaces — events and explore — are documented separately:

- This page covers events.
- See [arch-explore.md](arch-explore.md) for the explore feed (in-app + public API).

---

## Routes

```
GET /bulletin_board                    # bulletin_board#index — Inertia page
GET /bulletin_board/search             # bulletin_board#search — JSON, used by debounced explore filtering
GET /bulletin_board/events/:id         # bulletin_board#event — public event detail (Inertia, modal-aware)
```

All three are `allow_unauthenticated_access`, `allow_trial_access`, `skip_onboarding_redirect`. Pundit verification is skipped because the controller renders explicit public scopes (`BulletinEvent.where.not(starts_at: nil)` for events, `*.public_for_explore` for explore content). **Drafts are filtered out** of every public response by the `where.not(starts_at: nil)` predicate.

`/bulletin_board?project=:id` also sets OG/Twitter meta tags for the selected public project so Slack unfurls can render a project card for bulletin-board links.

Admin management lives at `/admin/bulletin_events` (staff-readable, admin-only writes).

---

## `BulletinEvent` Model — `app/models/bulletin_event.rb`

| Column | Notes |
|---|---|
| `title`, `description` | required |
| `image_url` | optional, validated against `URI::DEFAULT_PARSER.make_regexp(%w[http https])` |
| `schedulable` | boolean, default `true`. `true` = scheduled (uses `starts_at`/`ends_at`); `false` = manual mode (admin starts/ends explicitly via member actions) |
| `starts_at` | nullable. Required when `schedulable: true`. `nil` = draft state in both modes |
| `ends_at` | nullable. Validated `> starts_at` if both present |

### Status Derivation — `BulletinEvent#status`

The model derives status from `starts_at`/`ends_at`/`schedulable` with one important wrinkle: scheduled and manual events use different rules.

**Manual (`schedulable: false`)**:
- `ends_at` present → `:expired`
- `starts_at` nil → `:draft`
- Otherwise → `:happening`

**Scheduled (`schedulable: true`)**:
- `ends_at <= now` → `:expired`
- `starts_at` nil → `:draft`
- `starts_at > now` → `:upcoming`
- Otherwise → `:happening`

Status is computed at request time on the model and serialized via `BulletinEventSerializer` — never persisted. The frontend has its own `computeBulletinEventStatus()` helper (in `lib/bulletinEventStatus.ts`) so the UI can re-evaluate as time passes between live broadcasts (see [pages/bulletin_board/index.tsx](app/frontend/pages/bulletin_board/index.tsx) `useNowTick`).

### Lifecycle Helpers

- `start_now!` — sets `starts_at: Time.current` only if currently nil. Used for manual-mode events transitioning from draft to happening.
- `force_start_now!` — unconditionally sets `starts_at: Time.current`. Used by admins to override a scheduled event's start time (e.g., to begin early).
- `end_now!` — sets `ends_at: Time.current`.

### Scopes

- `happening` — currently active (manual-with-start-no-end OR scheduled-within-window).
- `upcoming_or_happening` — not expired (in either mode).
- `expired` — has `ends_at` (manual: any non-null ends_at; scheduled: ends_at in the past).

Used by admin filters and bulk-cleanup. The public bulletin board does **not** filter by these — it shows everything that isn't a draft, ordered with `COALESCE(starts_at, '9999-01-01') ASC` so unscheduled-but-published manual events sort last.

---

## Admin Surface — `app/controllers/admin/bulletin_events_controller.rb`

Routes (`/admin/bulletin_events/...`):

| Verb | Path | Action | Notes |
|---|---|---|---|
| GET | `/` | `index` | Tabs: `upcoming` (default), `all`, `expired`. Staff-readable. |
| POST | `/` | `create` | Admin-only |
| PATCH | `/:id` | `update` | Admin-only. Smart `schedulable` toggle — see normalization below |
| DELETE | `/:id` | `destroy` | Admin-only |
| DELETE | `/bulk_destroy` | `bulk_destroy` | Admin-only. Filtered to `expired` scope inside `policy_scope` to prevent destruction of live events |
| DELETE | `/destroy_expired` | `destroy_expired` | Admin-only. Wipes all expired events |
| PATCH | `/:id/start_now` | `start_now` | Admin-only. Manual mode start |
| PATCH | `/:id/force_start_now` | `force_start_now` | Admin-only. Override scheduled start |
| PATCH | `/:id/end_now` | `end_now` | Admin-only |

**`require_admin!` is `except: [ :index ]`** — staff-readable, admin-only writes. Per AGENTS.md's `only:` vs `except:` rule, this is the correct direction for a *restricting* directive (a forgotten new action defaults to admin-required).

### `schedulable` Toggle Normalization

`Admin::BulletinEventsController#normalized_event_params` handles the case where an admin flips `schedulable` from `true → false` mid-edit. Behavior depends on current event status:
- `:draft` / `:upcoming` — clear both `starts_at` and `ends_at` (treat as fresh manual draft).
- `:happening` — preserve `starts_at` (or set to now), clear `ends_at` (manual events end via `end_now!`).
- `:expired` — preserve both timestamps (it's already in terminal state).

Going `false → false`, blank submitted values are preserved as nil. `false → true` is allowed by the validator only if `starts_at` is filled in.

---

## Live Updates (ActionCable)

`BulletinEvent` includes `Broadcastable` (`app/models/concerns/broadcastable.rb`) and broadcasts to the static stream `bulletin_events` on every after_commit. The payload is intentionally a "dirty signal" only — `{ stream, id, action }` — so receivers must re-fetch via Inertia partial reload. **No PII or attributes cross the cable**, which is critical because the channel is subscribed to by the public bulletin board page.

Frontend subscriptions (via [`useLiveReload`](app/frontend/lib/useLiveReload.ts)):

| Page | Stream | `only:` props |
|---|---|---|
| `pages/bulletin_board/index.tsx` | `bulletin_events` | `['events']` |
| `pages/bulletin_board/events/show.tsx` | `bulletin_events` | (full reload) |
| `pages/admin/bulletin_events/index.tsx` | `bulletin_events` | `['events']` |

`useLiveReload` is modal-aware: inside an InertiaUI Modal overlay it calls `modal.reload()` and snapshots `modal.props` into local state to drive a re-render (the modal fork's prop-propagation chain is unreliable for some subtrees). Outside a modal it falls back to `router.reload({ only })`. See the comment block at the top of `useLiveReload.ts` for details.

---

## Frontend (`pages/bulletin_board/index.tsx`)

Single multi-section Inertia page:

- **Featured** — currently a hardcoded array of 4 placeholder cards in `BulletinBoardController#placeholder_featured` (real images on cdn.hackclub.com but treat as a stub until properly modeled).
- **Events** — server-rendered via `real_events`, sorted with the `COALESCE(...)` trick. Client uses `useNowTick` to re-evaluate event status (`upcoming → happening → expired`) without waiting for a broadcast.
- **Explore** — embedded discovery feed. See [arch-explore.md](arch-explore.md) for the full feed mechanics. The page passes initial server-rendered slices for both `projects` and `journals` so first paint requires no client fetch.

The `is_modal: request.headers["X-InertiaUI-Modal"].present?` prop tells the page whether it was opened inside a modal overlay (e.g., navigated into from elsewhere) so it can adjust layout.

---

## Edge Cases

| Risk | Handling |
|---|---|
| Draft events leaking publicly | Every public query filters `where.not(starts_at: nil)` (drafts have `starts_at IS NULL`). Admin queries don't filter — drafts visible to staff. |
| `bulk_destroy` accidentally hitting a live event | `bulk_destroy` chains `.expired` onto the `policy_scope` after filtering by submitted IDs — non-expired events submitted in the bulk request are silently dropped. |
| `schedulable` flip losing data | `normalized_event_params` preserves timestamps in modes where the data is meaningful (`:happening`, `:expired`) and clears them where it isn't (`:draft`, `:upcoming`). |
| Manual `force_start_now!` racing with a scheduled `start_now!` | `start_now!` is idempotent (checks `starts_at.present?`); `force_start_now!` always overwrites. Admin uses `force_start_now!` when intentional. |
| Validation of unschedulable events with future `ends_at` | `ends_at_after_starts_at` validates only when both are present — manual events with `starts_at: nil` and a future `ends_at` would pass, but the form path doesn't allow that combo. |
| Public broadcast leaking attributes | `Broadcastable#broadcast_live_update` only sends `{stream, id, action}`. Frontend re-fetches through the controller, which re-runs Pundit/serializers — the policy + serializer are the source of truth for what's exposed. |

---

## Related

- [arch-explore.md](arch-explore.md) — discovery feed mechanics (in-app feed + public `/api/v1/explore` API)
- [arch-services-infra.md](arch-services-infra.md) — ActionCable infra
- `app/policies/bulletin_event_policy.rb` — staff-can-read, admin-can-write
- `app/controllers/concerns/bulletin_event_serializer.rb` — single-source serializer used by both public and admin controllers
