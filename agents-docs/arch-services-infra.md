---
name: Services & Infrastructure Architecture
description: External service integrations (HCA, Lapse, Lookout, Slack, YouTube, Airtable), background jobs, storage, monitoring, deployment
type: project
---

# Services & Infrastructure

Fallout integrates with several Hack Club internal services (HCA for auth, Lapse for timelapses, Lookout for screen recordings) plus external APIs (YouTube, Slack, Airtable). Background jobs run via Solid Queue. Files stored on Cloudflare R2.

## External Service Integrations

### HCA (Hack Club Authentication) — `app/services/hca_service.rb`

OAuth 2.0 identity provider. See [auth-architecture.md](auth-architecture.md) for full flow.

- **Production**: `https://auth.hackclub.com`
- **Dev**: `https://hca.dinosaurbbq.org`
- **Scopes** (prod): `email name profile birthdate address verification_status slack_id`
- **Methods**: `authorize_url`, `exchange_code_for_token`, `me`, `identity`, `address_portal_url`, `verify_portal_url`
- **Env**: `HCA_CLIENT_ID`, `HCA_CLIENT_SECRET`

### Lapse (Timelapse Tool) — `app/services/lapse_service.rb`

PKCE OAuth + API for timelapse recordings from Hackatime.

- **Host**: `https://api.lapse.hackclub.com`
- **OAuth**: PKCE flow (S256 code challenge). Token stored encrypted in `user.lapse_token`.
- **Two access modes**:
  - **User token** (primary): `my_published_timelapses`, `timelapses_for_project`, `fetch_timelapse`, `hackatime_projects`
  - **Program key** (fallback): `query_user_by_email`, `find_timelapses_by_user` — for users without Lapse auth
- **`hackatime_projects(access_token)`**: fetches Hackatime projects linked to the user's Lapse account via `GET /api/user/hackatimeProjects`
- **Pagination**: cursor-based with configurable limit
- **Controller**: `LapseAuthController` handles OAuth start/callback
- **Env**: `LAPSE_CLIENT_ID`, `LAPSE_CLIENT_SECRET`, `LAPSE_PROGRAM_KEY`

### Lookout (Video Recording) — `app/services/lookout_service.rb`

Screen/camera recording sessions with signed URLs. See [lookout-api-docs.md](lookout-api-docs.md) for full API reference.

- **Host**: `ENV["LOOKOUT_URL"]` (default `https://lookout.hackclub.com`)
- **Auth**: Internal endpoints use `X-API-Key` header; public endpoints use session token in URL
- **Key methods**:
  - `create_session(metadata:)` — internal, requires API key
  - `get_session(token)` — public, returns session data with signed URLs
  - `get_video_url(token)` / `get_thumbnail_url(token)` — fresh signed URLs (1hr expiry)
  - `batch_sessions(tokens)` — max 100 tokens per request
- **Feature flag**: `:"03_18_collapse"` (shared as `lookout` to frontend)
- **NPM packages**: still named `@collapse/*` pending upstream rename
- **Env**: `LOOKOUT_URL`, `LOOKOUT_API_KEY`

### YouTube — `app/services/you_tube_service.rb`

Video metadata fetching and caching.

- **API**: YouTube Data API v3 (`/youtube/v3/videos`, snippet + contentDetails)
- **Methods**:
  - `find_or_fetch(url)` — returns cached `YouTubeVideo` record or fetches new
  - `extract_video_id(url)` — parses URLs, **rejects Shorts**
  - `thumbnail_url(url, quality:)` — generates i.ytimg.com URL
- **Anti-abuse**: Videos ≤60s that aren't live streams rejected as Shorts
- **Env**: `YOUTUBE_API_KEY`

### Hackatime — `app/services/hackatime_service.rb`

Time tracking verification.

- **Host**: `https://hackatime.hackclub.com`
- **Single method**: `me(access_token)` — `GET /api/v1/authenticated/me` with bearer token
- **Used during**: onboarding/integration validation

### Slack

User messaging and channel management via bot token.

- **Jobs**: `SlackMsgJob` (sends DMs/channel posts), `SlackChannelInviteJob` (invites to channels)
- **Welcome channels**: `User::SLACK_WELCOME_CHANNELS` constant (invited on trial→full promotion)
- **Error handling**: gracefully ignores `AlreadyInChannel`, warns on `UserIsRestricted`
- **Used by**: `AuthController#create` (post-HCA verification welcome), `User#refresh_profile_from_slack`
- **Env**: `SLACK_BOT_TOKEN`

#### Native link unfurls

- **Endpoint:** `POST /slack/events` (`Slack::EventsController#create`)
- **Auth:** request signature verification using `SLACK_SIGNING_SECRET` (`X-Slack-Signature`, `X-Slack-Request-Timestamp`)
- **Events:** handles `url_verification` + `event_callback` `link_shared`
- **Supported URLs:**
  - `https://fallout.hackclub.com/projects/:id`
  - `https://fallout.hackclub.com/bulletin_board?project=:id`
- **Response:** calls `chat.unfurl` with the same native `card` block structure used in review thread messages (title/subtitle/body/actions/hero image/icon)

### MailDeliveryService — `app/services/mail_delivery_service.rb`

Creates in-app MailMessage notifications. Not an external integration — purely internal, but lives in `services/` because it's a stateless service object.

**Methods:**
- `ship_status_changed(ship)` — creates targeted notification on approval/return/rejection with feedback. Links to project page.
- `collaboration_invite_sent(invite)` — creates non-dismissable notification for invitee. Links to invite show page. `dismissable: false` forces accept/decline.

### Airtable — `app/models/airtable_sync.rb`

Outbound sync for Users, Projects, ShopOrders, Ships, and the four review types (TimeAudit/RequirementsCheck/Design/Build).

- **Sync modes**: individual record POST/PATCH, batch CSV upload (up to 10,000+ records)
- **Change tracking**: `AirtableSync` records store last sync timestamp + Airtable record ID, keyed by `"#{ClassName}##{id}"`
- **Parallel processing**: 10 worker threads for batch
- **Config per model**: `airtable_sync_table_id`, `airtable_sync_field_mappings`, optional `airtable_sync_sync_id`/`airtable_should_batch`/`airtable_batch_size`/`airtable_sync_preload`/`airtable_sync_scope`
- **Scheduled**: every 5 minutes via `AirtableSyncJob` → `AirtableSyncClassJob` per class (see `AirtableSyncJob::CLASSES_TO_SYNC`)
- **Env**: `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID`

**Unified reviews table**: All four `Reviewable` subclasses sync to one Airtable table (`tblH5ENbMHrWR6hyd`, sync `J3D2bzea`). Shared sync config (table id, sync id, batch flags, ship preload, base field mappings) lives in `Reviewable.class_methods`. Each subclass declares a 2-letter `review_id_prefix` (`TA`/`RC`/`DR`/`BR`) and an `extra_review_field_mappings` override. Rows in Airtable are disambiguated by a prefixed "Review ID" column (e.g. `TA12`, `BR12`). Each class still gets its own `AirtableSync` row in the local table (different `record_identifier`); Airtable upserts merge them server-side via the shared sync source.

**Ships table** (`tblz2umphZqnDoQDZ`, sync `PLi0fLU8`): one row per `Ship`, includes the three hour flavors (`Logged Hours`, `Approved Hours`, `Internal Hours` — see [arch-ship-and-koi.md](arch-ship-and-koi.md) §7), `Koi Awarded` (sum of `KoiTransaction` where `reason='ship_review'`), per-pipeline review statuses, and the user-facing fields (justification/feedback/links). Logged hours uses `Ship.batch_time_logged` (single SQL aggregate over recordings) to avoid N+1 across the sync run.

**One-shot YSWS Unified Submissions upload** (`tbl1CXrjDLqtYp84y`): per-approval push, separate from the cron mirror. Two parallel jobs fire on approval (and from the backfill rake):

1. `Ship after_update_commit :enqueue_unified_airtable_upload, if: :saved_change_to_status?` — fires when the ship reaches `:approved` and the user is non-trial. Enqueues both jobs below in parallel; the screenshot path runs independently of the record creation so the slow LLM/image work doesn't block the YSWS row from appearing.

2. `ShipUnifiedAirtableUploadJob` — fast path. Calls `Ship#upload_to_unified_airtable!`, which builds a fields hash (HCA identity name/birthday/primary address, repo/demo links, project description, ship id) and POSTs/PATCHes via `AirtableSync.upload_or_create!`. Identifier suffix `"Ship#<id>/unified"` keeps the local `AirtableSync` row distinct from the cron mirror's `"Ship#<id>"`. `upload_or_create!` persists the returned airtable_id back so retries PATCH the existing row instead of creating duplicates (a hackworks gotcha we deliberately don't replicate). No Screenshot field is included here — that's handled by the second job via a different endpoint.

3. `AttachShipUnifiedScreenshotJob` — slow path. Finds a source URL via `ShipChecks::UnifiedScreenshotFinder` (four-stage strategy below), caches it on `ship.frozen_screenshot`, processes via `ShipChecks::UnifiedScreenshotProcessor` (libvips → JPEG, progressive quality reduction until ≤5MB; supports PNG/JPG/WEBP/GIF + PDF rendered through libpoppler-glib8), then POSTs the bytes to `https://content.airtable.com/v0/{base}/{recordId}/Screenshot/uploadAttachment` via `AirtableSync.upload_attachment!`. The job retries with `wait: 15.seconds, attempts: 8` if the parallel upload job hasn't yet created the Airtable record (no airtable_id in `AirtableSync`). After a successful attachment, writes a sentinel `AirtableSync` row keyed `"Ship#<id>/unified/screenshot"` so retries skip — `uploadAttachment` *appends* to the field array, so a repeat would duplicate the screenshot. SVG sources are still skipped (would require librsvg).

`UnifiedScreenshotFinder.find_url(project, ctx: nil, allow_representative: true, force: false)` strategy, in priority order. Callers can pass an already-built `SharedContext` via `ctx:` to avoid re-fetching the repo tree / re-running vision descriptions (preflight does this); `allow_representative: false` restricts to real zines (skips stage 4); `force: true` busts the cache. Results are cached 6h keyed by `[project.id, updated_at, allow_representative]` with `skip_nil: true`, so a "no zine" outcome is **not** cached and a later-added zine is found on the next check.

1. **Filename regex over the repo tree** — `zine|poster|flyer|magazine|page` + image/PDF extension. Fast, no LLM.
2. **LLM filter over the repo tree** — list every image/PDF file in the tree (regardless of name) and ask the LLM which is the zine. Catches zines named "submission.pdf", "{project}.png", etc. Cheap text-only call over filenames.
3. **LLM search of README images** — reuses the descriptions already memoized for `HasZinePage`, asks the LLM if any image is a zine.
4. **Fallback when no zine exists (only when `allow_representative: true`)** — LLM picks the best representative project image from the README (entire assembly, finished build on a desk, etc.) so the YSWS row still gets a usable screenshot. The on-demand cover button and preflight piggyback pass `allow_representative: false`, so this fallback is ship-approval-only.

No HCB API code is touched — Fallout only pushes data into the YSWS table; downstream YSWS automation handles any actual money flow.

Backfill: `bin/rake airtable:backfill_unified_ships` — dry-run by default, `APPLY=1` to enqueue, `SKIP_EXISTING=1` (default) avoids re-sending ships that already have a `"Ship#<id>/unified"` `AirtableSync` row. Filters: `SINCE`, `ONLY_SHIP_IDS`, `EXCLUDE_SHIP_IDS`. The rake enqueues the same parallel pair the live callback does. Run during quiet periods to avoid racing fresh approvals on the same ship (residual race window at the find-then-POST step can leave an orphaned Airtable row; the local `AirtableSync` UNIQUE index keeps only one airtable_id, but Airtable itself doesn't dedupe).

## Background Jobs — Solid Queue

**Config** (`config/queue.yml`): 4 worker pools:

| Pool | Queues | Threads | Purpose |
|---|---|---|---|
| 1 | `realtime`, `default` | 4 | User-facing: Slack messages, channel invites |
| 2 | `background`, `ahoy`, `uptime` | 6 | Async: Airtable sync, analytics, health checks |
| 3 | `active_storage` | 2 | File processing |
| 4 | `*` (wildcard) | 1 | Catch-all |

**Recurring jobs** (`config/recurring.yml`):

| Job | Schedule | Queue |
|---|---|---|
| `clear_solid_queue_finished_jobs` | Hourly (minute 12) | — |
| `UptimePingJob` | Every minute | `uptime` |
| `AirtableSyncJob` | Every 5 minutes | `background` |

**Job inventory:**
- `SlackMsgJob` — send Slack message (default queue)
- `SlackChannelInviteJob` — invite user to Slack channels (default queue)
- `AirtableSyncJob` → `AirtableSyncClassJob` — orchestrate per-model Airtable sync (background queue)
- `UptimePingJob` — health check ping to monitoring service (uptime queue)

Admin dashboard: MissionControl::Jobs at `/jobs` (admin-only constraint).

## Storage

### Active Storage
- **Dev**: local disk (`storage/` at project root)
- **Test**: `tmp/storage`
- **Prod**: Cloudflare R2 (S3-compatible)
- **Routes prefix**: `/user-attachments` (custom, not `/rails/active_storage`)
- **Direct upload auth**: patched in `config/initializers/active_storage_auth.rb` — verifies `session[:user_id]` exists because `DirectUploadsController` bypasses `ApplicationController`
- **Env (R2 production)**: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT` — all required for production S3-compatible storage

### Caching
- **Dev**: in-process memory
- **Prod**: Redis (256MB max, namespaced by env)
- **Env**: `REDIS_URL` (default `redis://localhost:6379/1`)

## Email — Loops.so

SMTP-based transactional email via `smtp.loops.so:587` (plain auth, STARTTLS).

- **Env**: `LOOPS_API_KEY`, `MAILER_FROM`, `APP_HOST`
- **Dev**: Letter Opener (opens emails in browser)

No Action Mailbox processors are implemented (inbound email is not used).

## Monitoring

| Service | Purpose | Config |
|---|---|---|
| **Sentry** | Error tracking (Ruby + React) | `config/initializers/sentry.rb`, `ErrorReporter` wrapper module |
| **Skylight** | Rails APM | `config/skylight.yml` |
| **Ahoy** | Analytics (visits, events) | `config/initializers/ahoy.rb`, geolocation via Hack Club geocoder |
| **Flipper UI** | Feature flag dashboard | `/flipper` (admin-only) |
| **MissionControl::Jobs** | Solid Queue dashboard | `/jobs` (admin-only) |

Sentry frontend: browserTracing (20% sample), replayOnError, canvas replay.

## Security Middleware

### Rack::Attack — `config/initializers/rack_attack.rb`

| Throttle | Limit | Scope |
|---|---|---|
| Global | 300/5min | per IP |
| Auth start | 10/min | per IP |
| HCA callback | 20/min | per IP |
| Sign out | 10/min | per IP |
| RSVP | 5/min | per IP |
| YouTube lookup | 10/min | per IP |

**Blocklist**: Fail2Ban for `/etc/passwd`, `wp-admin`, `wp-login` patterns — 5 attempts in 10 minutes → 1 hour ban.

### CSP — `config/initializers/content_security_policy.rb`

**Currently disabled** — the entire file is commented out (Rails boilerplate). No CSP headers are sent.

## Public API

`/api/v1/` — bearer token auth via `Authorization` header (constant-time comparison against `EXTERNAL_API_KEY`).

**Endpoints:**
- `GET /api/v1/projects` — paginated, searchable project list
- `GET /api/v1/projects/:id` — single project detail

## Deployment — Kamal

Docker containers orchestrated by Kamal (`config/deploy.yml`).

**Services**: Puma (web), Solid Queue (workers via `bin/jobs`).

**Note**: `deploy.yml` contains template placeholders (`app.example.com`, `192.168.0.1`) — actual production hosts are configured via Kamal secrets/environment, not checked into the repo.

**Key production settings**: SSL enforced, STDOUT logging with request ID tags, R2 storage, Redis cache.
