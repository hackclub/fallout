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

#### Disaster-recovery archive — `app/services/lapse_archive_service.rb`

Lapse is a third-party service; if it goes down, `playback_url`/`thumbnail_url` (Lapse-hosted) 404. `LapseArchiveService#archive!(lapse_timelapse, force:)` snapshots the **exact data our APIs depend on** to R2: the full raw `fetch_timelapse` response (`source`), the cached DB row (`db_record`), and the actual video + thumbnail bytes.

- **Storage**: a **self-managed `aws-sdk-s3` client** (built from the same `R2_*` env as the `:r2` ActiveStorage service), writing under the deterministic prefix `lapse-archive/<lapse_timelapse_id>/{metadata.json,video.<ext>,thumbnail.<ext>}`. Deliberately bypasses ActiveStorage — no `active_storage_*` rows, no `:r2` service, no `analyze` jobs — so it can never collide with or mutate ActiveStorage's random-keyed blobs.
- **Integrity (Lapse is semi-unstable)**: the downloaded video is `ffprobe`d (separate stdout/stderr, 30s hard-kill) for a real video stream + positive duration; the thumbnail must sniff as `image/*` (Marcel). Checks run **before** upload + before stamping `archived_at`, so a corrupt fetch raises and the row stays un-archived (fail-closed). Bounded network ops: Lapse download 5s open/30s read, R2 upload 10s/30s with a handshake-retry (`with_r2_retry`).
- **Graceful degrade**: a footage-less timelapse (FAILED_PROCESSING / unpublished) or one whose video has 404'd off Lapse (`FootageGone`) still gets a **metadata-only** archive — `metadata.json` (+ thumbnail if present), `archived_at` set, `archive_checksum` nil. Returns `:archived` / `:archived_metadata_only` / `:skipped`. Find metadata-only rows via `archived_at IS NOT NULL AND archive_checksum IS NULL`.
- **Idempotent**: deterministic keys (overwrite-safe) + an `archived_at` skip guard. `force: true` re-archives. Tracking columns on `lapse_timelapses`: `archived_at`, `archive_video_byte_size`, `archive_checksum` (sha256 of the video).
- **Trigger**: `ArchiveLapseTimelapseJob` (queue `:heavy`) is enqueued from `Recording` `after_create_commit` whenever a `LapseTimelapse` is attached to a journal entry (write-only; verification is not auto-run).
- **Backfill**: `rake lapse:archive_all` — work-stealing pool (`CONCURRENCY=n`, capped 24), `INLINE=1` synchronous, `FORCE=1` re-archives, `LIMIT=n`, `DRY_RUN=1` projects, per-item phase timings + Mbps. (R2 throttles ~5 Mbps/upload connection, so concurrency scales aggregate up to your uplink.)
- **Verify**: `LapseArchiveService#verify` / `VerifyLapseArchiveJob` / `rake lapse:verify_archives` (`DEEP=1` re-downloads + re-checksums) — confirms each archive's objects exist with expected sizes; problems → `log/lapse_archive_verify_problems.log`.

### Lookout (Video Recording) — `app/services/lookout_service.rb`

Screen/camera recording sessions with signed URLs. See [lookout-api-docs.md](lookout-api-docs.md) for full API reference.

- **Host**: `ENV["LOOKOUT_URL"]` (default `https://lookout.hackclub.com`)
- **Auth**: Internal endpoints use `X-API-Key` header; public endpoints use session token in URL
- **Key methods**:
  - `create_session(metadata:)` — internal, requires API key
  - `get_session(token)` — public, returns session data with signed URLs
  - `get_video_url(token)` / `get_thumbnail_url(token)` — fresh signed URLs (1hr expiry)
  - `batch_sessions(tokens)` — max 100 tokens per request
  - `download_video(token)` — follows the video URL (handles up to 3 redirects) into a `Tempfile` for server-side processing
- **Feature flag**: `:"03_18_collapse"` (shared as `lookout` to frontend)
- **NPM packages**: still named `@collapse/*` pending upstream rename
- **Env**: `LOOKOUT_URL`, `LOOKOUT_API_KEY`

### YouTube — `app/services/you_tube_service.rb`

Video metadata fetching and caching.

- **API**: YouTube Data API v3 (`/youtube/v3/videos`, `snippet,contentDetails,liveStreamingDetails`), with an oEmbed fallback (`youtube.com/oembed`) when the Data API key is missing or returns nothing
- **Methods**:
  - `find_or_fetch(url)` — returns cached `YouTubeVideo` record or fetches new
  - `extract_video_id(url)` — parses URLs (incl. `live/`), **rejects Shorts**
  - `thumbnail_url(url, quality:)` / `thumbnail_url_from_id(video_id, quality:)` — generates i.ytimg.com URL
- **Anti-abuse**: Videos ≤60s that aren't live streams rejected as Shorts
- **Live streams**: `was_live` derived from `liveBroadcastContent` + `liveStreamingDetails`; recently-ended streams fall back to `actualEndTime - actualStartTime` for duration and are re-fetched after 1 day via `YouTubeVideoRefetchJob`
- **Env**: `YOUTUBE_API_KEY` (falls back to `GOOGLE_CLOUD_API_KEY`)

### Hackatime — `app/services/hackatime_service.rb`

Time tracking verification.

- **Host**: `https://hackatime.hackclub.com`
- **Single method**: `me(access_token)` — `GET /api/v1/authenticated/me` with bearer token
- **Used during**: onboarding/integration validation

### Slack

User messaging and channel management via bot token.

- **Jobs**: `SlackMsgJob` (sends DMs/channel posts), `SlackChannelInviteJob` (invites to channels)
- **Welcome channels**: `User::SLACK_WELCOME_CHANNELS` constant (invited on trial→full promotion)
- **Error handling**: invites gracefully ignore `AlreadyInChannel`, warn on `UserIsRestricted`/`CantInvite`. `SlackMsgJob` serializes sends via `limits_concurrency to: 1` + a 1.1s sleep (Slack ~1 msg/sec workspace limit) and retries `TooManyRequestsError`/`TimeoutError` with backoff.
- **Used by**: `AuthController#create` (post-HCA verification welcome), `User#refresh_profile_from_slack`
- **Env**: `SLACK_BOT_TOKEN`

#### Native link unfurls

- **Endpoint:** `POST /slack/events` (`Slack::EventsController#create`)
- **Auth:** request signature verification using `SLACK_SIGNING_SECRET` (`X-Slack-Signature`, `X-Slack-Request-Timestamp`)
- **Events:** handles `url_verification` + `event_callback` `link_shared`
- **Supported URLs:**
  - `https://fallout.hackclub.com/projects/:id`
  - `https://fallout.hackclub.com/bulletin_board?project=:id`
- **Response:** calls `chat.unfurl` with the same native `card` block structure used in review thread messages — built via the shared `SlackProjectCardService.build_card_block` (title/subtitle/body/actions/hero image/icon). Only resolves projects visible via `Project.public_for_explore`.

### MailDeliveryService — `app/services/mail_delivery_service.rb`

Creates in-app MailMessage notifications. Not an external integration — purely internal, but lives in `services/` because it's a stateless service object.

**Methods** (class methods, one per notification type):

- `ship_status_changed(ship)` — creates targeted notification on approval/return/rejection with feedback. Links to project page.
- `collaboration_invite_sent(invite)` — creates non-dismissable notification for invitee. Links to invite show page. `dismissable: false` forces accept/decline.
- `blueprint_transfer(user, project_names)` — notifies on Blueprint transfer.
- Streak family: `streak_milestone`, `streak_reminder`, `streak_broken`, `streak_goal_broken`, `streak_goal_completed`, `streak_freeze_used` — driven by the streak jobs (see Background Jobs).
- Broadcast/announcement helpers (`mail_intro`, `professors_announcement`) — one-off campaign messages, some with `pinned`/`filters`/`expires_at`.

### Airtable — `app/models/airtable_sync.rb`

Outbound sync for Users, Projects, ShopOrders, Ships, and the four review types (TimeAudit/RequirementsCheck/Design/Build).

- **Sync modes**: individual record POST/PATCH, batch CSV upload (up to 10,000+ records)
- **Change tracking**: `AirtableSync` records store last sync timestamp + Airtable record ID, keyed by `"#{ClassName}##{id}"`
- **Parallel processing**: 10 worker threads for batch
- **Config per model**: `airtable_sync_table_id`, `airtable_sync_field_mappings`, optional `airtable_sync_sync_id`/`airtable_should_batch`/`airtable_batch_size`/`airtable_sync_preload`/`airtable_sync_scope`
- **Scheduled**: every 5 minutes via `AirtableSyncJob` → `AirtableSyncClassJob` per class (see `AirtableSyncJob::CLASSES_TO_SYNC`)
- **Env**: `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID`

**Unified reviews table**: All four `Reviewable` subclasses sync to one Airtable table (`tblH5ENbMHrWR6hyd`, sync `J3D2bzea`). Shared sync config (table id, sync id, batch flags, ship preload, base field mappings) lives in `Reviewable.class_methods`. Each subclass declares a 2-letter `review_id_prefix` (`TA`/`RC`/`DR`/`BR`) and an `extra_review_field_mappings` override. Rows in Airtable are disambiguated by a prefixed "Review ID" column (e.g. `TA12`, `BR12`). Each class still gets its own `AirtableSync` row in the local table (different `record_identifier`); Airtable upserts merge them server-side via the shared sync source.

**Ships table** (`tbl1LJG0FKSV61wcW`, sync `5BFGD4ac`): one row per `Ship`, includes the three hour flavors (`Logged Hours`, `Approved Hours`, `Internal Hours` — see [arch-ship-and-koi.md](arch-ship-and-koi.md) §7), `Koi Awarded` (sum of `KoiTransaction` where `reason='ship_review'`), per-pipeline review statuses, and the user-facing fields (justification/feedback/links). Logged hours uses `Ship.batch_time_logged` (single SQL aggregate over recordings) to avoid N+1 across the sync run.

**One-shot YSWS Unified Submissions upload** (`tbl1CXrjDLqtYp84y`): per-approval push, separate from the cron mirror. Two parallel jobs fire on approval (and from the backfill rake):

1. `Ship after_update_commit :enqueue_unified_airtable_upload, if: :saved_change_to_status?` — fires when the ship reaches `:approved` and the user is non-trial. Enqueues both jobs below in parallel; the screenshot path runs independently of the record creation so the slow LLM/image work doesn't block the YSWS row from appearing.

2. `ShipUnifiedAirtableUploadJob` — fast path. Calls `Ship#upload_to_unified_airtable!`, which builds a fields hash (HCA identity name/birthday/primary address, repo/demo links, project description, ship id) and POSTs/PATCHes via `AirtableSync.upload_or_create!`. Identifier suffix `"Ship#<id>/unified"` keeps the local `AirtableSync` row distinct from the cron mirror's `"Ship#<id>"`. `upload_or_create!` persists the returned airtable_id back so retries PATCH the existing row instead of creating duplicates (a hackworks gotcha we deliberately don't replicate). No Screenshot field is included here — that's handled by the second job via a different endpoint.

3. `AttachShipUnifiedScreenshotJob` — slow path. Finds a source URL via `ShipChecks::UnifiedScreenshotFinder` (four-stage strategy below), caches it on `ship.frozen_screenshot`, processes via `ShipChecks::UnifiedScreenshotProcessor` (libvips → JPEG, progressive quality reduction until ≤5MB; supports PNG/JPG/WEBP/GIF + PDF rendered through libpoppler-glib8), then POSTs the bytes to `https://content.airtable.com/v0/{base}/{recordId}/Screenshot/uploadAttachment` via `AirtableSync.upload_attachment!`. The job retries with `wait: 15.seconds, attempts: 8` if the parallel upload job hasn't yet created the Airtable record (no airtable_id in `AirtableSync`). After a successful attachment, writes a sentinel `AirtableSync` row keyed `"Ship#<id>/unified/screenshot"` so retries skip — `uploadAttachment` _appends_ to the field array, so a repeat would duplicate the screenshot. SVG sources are still skipped (would require librsvg).

`UnifiedScreenshotFinder.find_url(project, ctx: nil, allow_representative: true, force: false)` strategy, in priority order. Callers can pass an already-built `SharedContext` via `ctx:` to avoid re-fetching the repo tree / re-running vision descriptions (preflight does this); `allow_representative: false` restricts to real zines (skips stage 4); `force: true` busts the cache. Results are cached 6h keyed by `[project.id, updated_at, allow_representative]` with `skip_nil: true`, so a "no zine" outcome is **not** cached and a later-added zine is found on the next check.

1. **Filename regex over the repo tree** — `zine|poster|flyer|magazine|page` + image/PDF extension. Fast, no LLM.
2. **LLM filter over the repo tree** — list every image/PDF file in the tree (regardless of name) and ask the LLM which is the zine. Catches zines named "submission.pdf", "{project}.png", etc. Cheap text-only call over filenames.
3. **LLM search of README images** — reuses the descriptions already memoized for `HasZinePage`, asks the LLM if any image is a zine.
4. **Fallback when no zine exists (only when `allow_representative: true`)** — LLM picks the best representative project image from the README (entire assembly, finished build on a desk, etc.) so the YSWS row still gets a usable screenshot. The on-demand cover button and preflight piggyback pass `allow_representative: false`, so this fallback is ship-approval-only.

No HCB API code is touched — Fallout only pushes data into the YSWS table; downstream YSWS automation handles any actual money flow.

Backfill: `bin/rake airtable:backfill_unified_ships` — dry-run by default, `APPLY=1` to enqueue, `SKIP_EXISTING=1` (default) avoids re-sending ships that already have a `"Ship#<id>/unified"` `AirtableSync` row. Filters: `SINCE`, `ONLY_SHIP_IDS`, `EXCLUDE_SHIP_IDS`. The rake enqueues the same parallel pair the live callback does. Run during quiet periods to avoid racing fresh approvals on the same ship (residual race window at the find-then-POST step can leave an orphaned Airtable row; the local `AirtableSync` UNIQUE index keeps only one airtable_id, but Airtable itself doesn't dedupe).

## Background Jobs — Solid Queue

**Config** (`config/queue.yml`): 3 worker pools (process count is `JOB_CONCURRENCY`, default 2):

| Pool | Queues                                                                                   | Threads | Purpose                                                                                          |
| ---- | ---------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------ |
| 1    | `realtime`, `default`                                                                    | 2       | User-facing: Slack messages, channel invites                                                     |
| 2    | `background`, `ahoy`, `meilisearch`, `active_storage`, `solid_queue_recurring`, `uptime` | 4       | Async: Airtable sync, analytics, search reindex, file processing, recurring tasks, health checks |
| 3    | `heavy`                                                                                  | 4       | Long-running work                                                                                |

There is no wildcard (`*`) catch-all pool — jobs must target one of the queues above.

**Recurring jobs** (`config/recurring.yml`, production only):

| Job                                         | Schedule           | Queue        |
| ------------------------------------------- | ------------------ | ------------ |
| `clear_solid_queue_finished_jobs` (command) | Hourly (minute 12) | —            |
| `UptimePingJob`                             | Every minute       | `uptime`     |
| `AirtableSyncJob`                           | Every 5 minutes    | `background` |
| `ExpireStaleReviewClaimsJob`                | Every 10 minutes   | `background` |
| `HcbTokenRefreshJob`                        | Hourly             | `background` |
| `HcbGrantCardSyncJob`                       | Every 15 minutes   | `background` |
| `HcbDonationSyncJob`                        | Every 5 minutes    | `background` |
| `StreakReconciliationJob`                   | Every 30 minutes   | `background` |
| `StreakNotificationJob`                     | Hourly (minute 30) | `background` |
| `StreakLeaderboardJob`                      | Daily 5pm          | `background` |
| `ProjectInactivityJob`                      | Daily 9am          | `background` |
| `UserBanCheckJob`                           | Every 30 minutes   | `background` |
| `HcaIdentityRefreshJob`                     | Every 10 minutes   | `background` |
| `YouTubeVideoBackfillJob`                   | Daily 11pm         | `background` |
| `hours_stats_refresh` (command)             | Daily 5am          | —            |
| `RefreshStaleUnifiedThumbnailsJob`          | Hourly             | `background` |

**Job inventory** (selected; full list in `app/jobs/`):

- `SlackMsgJob` — send Slack message (default queue)
- `SlackChannelInviteJob` — invite user to Slack channels (default queue)
- `AirtableSyncJob` → `AirtableSyncClassJob` — orchestrate per-model Airtable sync (background queue)
- `ShipUnifiedAirtableUploadJob` / `AttachShipUnifiedScreenshotJob` — YSWS unified-submission upload pair (see Airtable section)
- `UptimePingJob` — health check ping to monitoring service (uptime queue)
- `HcaIdentityRefreshJob` — refreshes HCA identity, clears invalid tokens
- Streak jobs (`StreakReconciliationJob`, `StreakNotificationJob`, `StreakLeaderboardJob`) drive the MailDeliveryService streak notifications

Admin dashboard: MissionControl::Jobs at `/jobs` (admin-only constraint).

## Storage

### Active Storage

- **Dev**: local disk (`storage/` at project root)
- **Test**: `tmp/storage`
- **Prod**: Cloudflare R2 (S3-compatible)
- **Routes prefix**: `/user-attachments` (custom, not `/rails/active_storage`)
- **Direct upload auth**: patched in `config/initializers/active_storage_auth.rb` — verifies `session[:user_id]` exists because `DirectUploadsController` bypasses `ApplicationController`
- **Env (R2 production)**: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT` — all required for production S3-compatible storage

### Direct R2 use (non-ActiveStorage)

- `lapse-archive/<lapse_timelapse_id>/` — Lapse disaster-recovery archive written by `LapseArchiveService` via a self-managed `aws-sdk-s3` client (same `R2_*` env). Reserved prefix; ActiveStorage keys are random and slashless so they never overlap. See the Lapse section above.

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

| Service                  | Purpose                                 | Config                                                                                                               |
| ------------------------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Sentry**               | Error tracking + tracing (Ruby + React) | `config/initializers/sentry.rb` (traces/profiles 20% in prod), `ErrorReporter` wrapper (`app/lib/error_reporter.rb`) |
| **RailsPerformance**     | Rails APM dashboard                     | `/admin/performance` (admin-only, mounted only when `REDIS_URL` is set)                                              |
| **Ahoy**                 | Analytics (visits, events)              | `config/initializers/ahoy.rb`, `geocode = true`, jobs on `background` queue, CF-Connecting-IP, disabled in dev       |
| **Flipper UI**           | Feature flag dashboard                  | `/flipper` (admin-only)                                                                                              |
| **MissionControl::Jobs** | Solid Queue dashboard                   | `/jobs` (admin-only)                                                                                                 |

Sentry frontend: browserTracing (20% sample), replayOnError, canvas replay.

## Security Middleware

### Rack::Attack — `config/initializers/rack_attack.rb`

All IP-keyed throttles use Cloudflare's `CF-Connecting-IP` (the `CFConnectingIp` prepend) rather than `req.ip`, so a spoofed `X-Forwarded-For` can't bypass them. There is no global all-routes throttle.

| Throttle                                           | Limit                                 | Scope                  |
| -------------------------------------------------- | ------------------------------------- | ---------------------- |
| Auth start (`/auth/hca/start`)                     | 10/min                                | per IP                 |
| HCA callback (`/auth/hca/callback`)                | 20/min                                | per IP                 |
| Sign out (`/auth/signout`)                         | 10/min                                | per IP                 |
| RSVP (`/rsvp`)                                     | 5/min                                 | per IP                 |
| YouTube lookup (`/you_tube_videos/lookup`)         | 10/min                                | per IP                 |
| Trial session (`/trial_session`)                   | 10/3min per IP, 5/hr per hashed email | per IP + email         |
| API v1 (`/api/v1/*`)                               | 120/min per hashed key, 60/min per IP | per key + IP           |
| Collaboration invites                              | 20/hr                                 | per user (IP fallback) |
| Zine cover refresh (`/projects/:id/refresh_cover`) | 6/min                                 | per user (IP fallback) |

**Blocklist**: Fail2Ban for `/etc/passwd`, `wp-admin`, `wp-login` patterns — 5 attempts in 10 minutes → 1 hour ban.

### CSP — `config/initializers/content_security_policy.rb`

**Currently disabled** — the entire file is commented out (Rails boilerplate). No CSP headers are sent.

## Public API

`/api/v1/` — bearer token auth via `Authorization` header (constant-time comparison against `EXTERNAL_API_KEY`, in `Api::V1::BaseController` which inherits `ActionController::API`).

**Endpoints:**

- `GET /api/v1/projects` — paginated, searchable project list
- `GET /api/v1/projects/:id` — single project detail
- `GET /api/v1/users` / `GET /api/v1/users/:id` — user list / detail
- `GET /api/v1/explore/projects` / `GET /api/v1/explore/journals` — explore feeds

## Deployment — Docker

Docker containers

**Services**: Web, Solid Queue (workers via `bin/jobs`),
