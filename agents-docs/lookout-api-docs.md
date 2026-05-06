---
name: Lookout API Documentation
description: Full API docs for the Lookout (formerly Collapse) timelapse recording service — endpoints, auth, rate limits, session states, upload flow
type: reference
---

# Lookout Server API Documentation

**Framework:** Fastify v5
**Base URL:** `https://lookout.hackclub.com` (configurable via `PORT` and `BASE_URL` env vars)

---

## Authentication

### Public Routes (Session Token)
Public endpoints use a 64-character hex **session token** as a path parameter. No header-based auth required.

### Internal Routes (API Key)
Internal endpoints require the `X-API-Key` header matching the `INTERNAL_API_KEY` environment variable. Uses constant-time comparison.

---

## Rate Limiting

In-memory sliding window (60-second windows). Rate-limited responses return:

- **Status:** `429 Too Many Requests`
- **Header:** `Retry-After: <seconds>`
- **Body:** `{ "error": "Rate limit exceeded" }`

| Endpoint | Limit | Key |
|----------|-------|-----|
| `GET /api/sessions/:token` | 60 req/min | per token |
| `GET /api/sessions/:token/upload-url` | 3 req/min (configurable) | per session ID |
| `POST /api/sessions/:token/screenshots` | 10 req/min | per token |
| `POST /api/sessions/:token/pause` | 10 req/min | per token |
| `POST /api/sessions/:token/resume` | 10 req/min | per token |
| `POST /api/sessions/:token/stop` | 10 req/min | per token |
| `GET /api/sessions/:token/video` | 30 req/min | per token |
| `GET /api/sessions/:token/thumbnail` | 30 req/min | per token |
| `POST /api/sessions/batch` | 30 req/min | per IP |

---

## Session States

```
pending → active → paused → active → stopped → compiling → complete
                                   ↘              ↗
                                    stopped ──────
                                                  ↘ failed
```

Valid states: `pending`, `active`, `paused`, `stopped`, `compiling`, `complete`, `failed`

State transitions use optimistic locking — concurrent state changes return `409 Conflict`.

---

## Key Details

- **Signed URLs** (video, thumbnail) expire after **1 hour** (`X-Amz-Expires=3600`)
- **Presigned upload URLs** expire after **2 minutes**
- **Batch endpoint** accepts max **100 tokens**, returns sessions sorted by creation date (newest first)
- **Batch response** includes `thumbnailUrl` and `videoUrl` as signed URLs (same 1hr expiry)
- **Get Session** (`GET /api/sessions/:token`) also returns signed `thumbnailUrl` and `videoUrl`
- **Dedicated endpoints** `GET /api/sessions/:token/video` and `GET /api/sessions/:token/thumbnail` return fresh signed URLs on demand
- The `name` field is set via `POST /api/sessions/:token/stop` body or `POST /api/internal/sessions` body

---

## Public Endpoints

### Get Session Status
`GET /api/sessions/:token` → `{ status, trackedSeconds, screenshotCount, startedAt, totalActiveSeconds, createdAt, thumbnailUrl, videoUrl, videoWebmUrl, metadata }`

### Get Presigned Upload URL
`GET /api/sessions/:token/upload-url` → `{ uploadUrl, r2Key, screenshotId, minuteBucket, nextExpectedAt }`

### Confirm Screenshot Upload
`POST /api/sessions/:token/screenshots` body: `{ screenshotId, width, height, fileSize }` → `{ confirmed, trackedSeconds, nextExpectedAt }`

### Pause Session
`POST /api/sessions/:token/pause` → `{ status, totalActiveSeconds }`

### Resume Session
`POST /api/sessions/:token/resume` → `{ status, nextExpectedAt }`

### Stop Session
`POST /api/sessions/:token/stop` → `{ status, trackedSeconds, totalActiveSeconds }`

### Poll Compilation Status
`GET /api/sessions/:token/status` → `{ status, videoUrl, videoWebmUrl, trackedSeconds }`

### Get Video URL
`GET /api/sessions/:token/video[?format=webm]` → `{ videoUrl }` (1hr signed URL, only when `complete`)

### Get Thumbnail URL
`GET /api/sessions/:token/thumbnail` → `{ thumbnailUrl }` (1hr signed URL)

### Batch Get Sessions
`POST /api/sessions/batch` body: `{ tokens: [...] }` → `{ sessions: [{ token, status, trackedSeconds, screenshotCount, startedAt, createdAt, totalActiveSeconds, thumbnailUrl, videoUrl, videoWebmUrl, metadata }] }`

---

## Internal Endpoints (require `X-API-Key`)

### Create Session
`POST /api/internal/sessions` body: `{ name?, metadata? }` → `{ token, sessionId, sessionUrl }`

### Get Session Details (Admin)
`GET /api/internal/sessions/:sessionId` → full session object with internal fields

### Force-Stop Session (Admin)
`POST /api/internal/sessions/:sessionId/stop` → `{ status }`

### Recompile Failed Session (Admin)
`POST /api/internal/sessions/:sessionId/recompile` → `{ status }`

---

## Client Upload Flow

1. Create session — `POST /api/internal/sessions` (server-side)
2. Get upload URL — `GET /api/sessions/:token/upload-url`
3. Upload JPEG — `PUT <uploadUrl>` with `Content-Type: image/jpeg` (direct to R2)
4. Confirm upload — `POST /api/sessions/:token/screenshots`
5. Repeat 2-4 every 60 seconds
6. Stop session — `POST /api/sessions/:token/stop`
7. Poll status — `GET /api/sessions/:token/status` until `complete`
8. Get video — `GET /api/sessions/:token/video`

---

## Background Jobs

| Job | Schedule | Description |
|-----|----------|-------------|
| `compile-timelapse` | On demand | Compiles screenshots into MP4 + WebM. Retries 3x with backoff. |
| `check-timeouts` | Every 1 min | Auto-pauses idle >5 min, auto-stops idle >30 min, resets stuck compilations >60 min. |
| `cleanup-unconfirmed` | Every 5 min | Deletes unconfirmed screenshots older than 10 min. |
