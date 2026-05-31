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
GET /bulletin_board/events.ics         # bulletin_board#events_feed — iCalendar subscription feed (all non-draft events; expired older than 30 days are dropped)
GET /bulletin_board/events/:id.ics     # bulletin_board#event_ics — single-event ICS download for "Add to calendar"
```

All five are `allow_unauthenticated_access`, `allow_trial_access`, `skip_onboarding_redirect`. Pundit verification is skipped because the controller renders explicit public scopes (`BulletinEvent.where.not(starts_at: nil)` for events, `*.public_for_explore` for explore content). **Drafts are filtered out** of every public response by the `where.not(starts_at: nil)` predicate.

The ICS endpoints reuse the same draft filter and are served as `text/calendar; charset=utf-8`. The feed sets `Cache-Control: no-store, max-age=0`, and the generator emits `REFRESH-INTERVAL` / `X-PUBLISHED-TTL` of `PT5M` (5 minutes), so clients should treat the feed as non-cacheable while refreshing on roughly a 5-minute cadence if they honor the calendar metadata.

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

- **Featured** — admin-curated `FeaturedProject` records (see "Featured Projects" section below). Server renders all kept rows via `BulletinBoardController#real_featured`; the client paginates 4-per-page on the existing 2-col mobile / 4-col desktop grid. Subscribes to the `featured_projects` ActionCable stream so admin curation flows through `useLiveReload`.
- **Events** — server-rendered via `real_events`, sorted with the `COALESCE(...)` trick. Client uses `useNowTick` to re-evaluate event status (`upcoming → happening → expired`) without waiting for a broadcast. The events section header has a small toolbar with **Calendar view** and **Subscribe** buttons.
- **Explore** — embedded discovery feed. See [arch-explore.md](arch-explore.md) for the full feed mechanics. The page passes initial server-rendered slices for both `projects` and `journals` so first paint requires no client fetch.

The `is_modal: request.headers["X-InertiaUI-Modal"].present?` prop tells the page whether it was opened inside a modal overlay (e.g., navigated into from elsewhere) so it can adjust layout.

---

## Calendar integration

Three user-facing affordances let visitors save events to external calendars; all are powered by the `text/calendar` endpoints listed above.

| Component | File | Behavior |
|---|---|---|
| `AddToCalendarButton` | `app/frontend/components/bulletin_board/AddToCalendarButton.tsx` | Per-event popover with Google Calendar URL, .ics download (Apple/Outlook), and Outlook.com deeplink. Rendered icon-only on `EventCard` and labeled on `EventDetailPanel`. Stops click propagation so it doesn't trigger the card's wrapping `ModalLink`. |
| `CalendarViewModal` | `app/frontend/components/bulletin_board/CalendarViewModal.tsx` | Month-grid modal showing every non-draft event. Expired events are visually dimmed. Each chip is a `ModalLink` that opens the existing event detail modal. Built with Luxon, no extra fetch (consumes the same `events` array the page already has). |
| `SubscribeFeedModal` | `app/frontend/components/bulletin_board/SubscribeFeedModal.tsx` | Surfaces the feed URL with copy-to-clipboard plus one-click Google/Apple/Outlook subscribe buttons. URLs are generated client-side from `window.location.origin` so previews/staging share the same UI. |

Shared link helpers live in `app/frontend/lib/bulletinCalendarLinks.ts` (`googleCalendarUrl`, `outlookCalendarUrl`, `icsDownloadUrl`, `subscriptionUrls`).

Backend ICS rendering lives in `app/services/bulletin_event_ics_generator.rb` (uses the `icalendar` gem). Times are emitted in UTC (`DTSTART;TZID=UTC:...`). Each `VEVENT` carries a stable UID (`bulletin-event-<id>@<host>`) so calendar apps dedupe on edit instead of creating ghost copies. The feed variant adds `X-WR-CALNAME`, `X-WR-CALDESC`, `X-PUBLISHED-TTL:PT5M`, and `REFRESH-INTERVAL;VALUE=DURATION:PT5M`.

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

## Featured Projects

The Featured row at the top of `/bulletin_board` is curated by admins via `FeaturedProject` records — a soft-deletable join row between `projects` and `users` (the curator).

| File | Notes |
|---|---|
| `app/models/featured_project.rb` | `Discardable` + `Broadcastable :featured_projects`. `belongs_to :project`, `belongs_to :featured_by_user, class_name: "User"`. Validates project is kept + listed on create. `ordered` scope sorts by `position, featured_at`. |
| `db/migrate/20260527053922_create_featured_projects.rb` | Partial unique index `index_featured_projects_unique_active_project` (where `discarded_at IS NULL`) — a project may only be actively featured once but can re-appear in archive history. |
| `app/policies/featured_project_policy.rb` | Staff read; admin create/update_note/destroy/restore/reorder. |
| `app/controllers/admin/featured_projects_controller.rb` | Tabs: `active` / `archived`. Custom actions: `projects_search` (Meilisearch autocomplete excluding already-featured), `reorder` (bulk position update inside a transaction — explicit broadcast since `update_column` skips callbacks), `update_note`, `restore` (re-validates project is kept/listed before un-discarding, appends to end of position list). |
| `app/frontend/pages/admin/featured_projects/index.tsx` | Active tab uses `@dnd-kit/sortable` for drag-reorder cards; Archive tab is a shadcn `Table` with restore buttons. Note editing via `AlertDialog` + `Textarea`. |
| `app/frontend/pages/admin/featured_projects/FeaturedProjectFormSheet.tsx` | `cmdk` Command search hits `/admin/featured_projects/projects_search`. Debounced 250 ms with AbortController so out-of-order responses can't paint stale results. |

The public payload (`BulletinBoardController#real_featured` → `serialize_featured_card`) intentionally omits `slack_id` and any owner-PII — the only owner field exposed is `display_name`. Cards link to the project via `ModalLink`; the GitHub icon renders only when `repo_link` is present. Slack button is deliberately not rendered to avoid exposing `slack_id` publicly (see AGENTS.md "PII must only be exposed to admins").

Admins can also quick-feature/unfeature from `/admin/projects/:id` (Star toggle next to "User Facing") and see a star indicator on `/admin/projects` rows — backed by `featured_project_id` (show) and `is_featured` (index) exposed by `Admin::ProjectsController`.

---

## Related

- [arch-explore.md](arch-explore.md) — discovery feed mechanics (in-app feed + public `/api/v1/explore` API)
- [arch-services-infra.md](arch-services-infra.md) — ActionCable infra
- `app/policies/bulletin_event_policy.rb` — staff-can-read, admin-can-write
- `app/controllers/concerns/bulletin_event_serializer.rb` — single-source serializer used by both public and admin controllers
