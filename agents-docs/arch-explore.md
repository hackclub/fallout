---
name: Explore Feed
description: Public discovery surfaces for projects and journals — the in-app /bulletin_board feed and the public /api/v1/explore JSON API. Covers public_for_explore scopes, cursor pagination, Meilisearch + ActiveRecord fallback, and live-update wiring.
type: project
---

# Explore Feed

Two surfaces share the same underlying data and logic:

1. **In-app feed** — embedded in `/bulletin_board` (Inertia). See [arch-bulletin-board.md](arch-bulletin-board.md) for how the feed is composed into the community hub. Search hits `GET /bulletin_board/search` (JSON, debounced).
2. **Public API** — `GET /api/v1/explore/{projects,journals}` (JSON). Documented for API consumers in [docs/developer/api.mdx](docs/developer/api.mdx); this page covers the *internals* an agent maintaining the feature needs to know.

Both surfaces are **unauthenticated** (no API key required). The bulletin board controller skips Pundit verification entirely; the API controller uses `skip_before_action :authenticate_api_key!, only: %i[projects journals]` while keeping the rest of the API key-gated.

---

## Public Visibility — `public_for_explore` Scopes

Every public query starts from one of two scopes — they are the trust boundary for the feed:

```ruby
# app/models/project.rb
scope :public_for_explore, -> { kept.listed }

# app/models/journal_entry.rb
scope :public_for_explore, -> {
  kept.where(project_id: Project.public_for_explore.select(:id))
}
```

A journal entry is public iff its parent project is `kept` and not `is_unlisted`. Soft-deleting a project or flipping `is_unlisted` cascades to the journal feed without any explicit cleanup. **Don't bypass these scopes** when adding new queries — the controllers deliberately skip Pundit because these scopes ARE the policy.

---

## Two Controllers, Shared Logic

`BulletinBoardController` (in-app) and `Api::V1::ExploreController` (public API) implement nearly identical pagination + search logic. They share these constants/conventions:

| Concept | Bulletin board | Public API |
|---|---|---|
| Sort options | `active`, `newest` | `active`, `newest` |
| Default project sort | `active` | `active` |
| Journal sort | always `newest` (no choice) | always `newest` (no choice) |
| Default page limit | 5 | 20 |
| Max limit | 50 | 50 |
| Search hard cap | 500 (Meilisearch) | 500 (Meilisearch) |
| Cursor format | `Base64.urlsafe_encode64("<iso8601 or 'none'>|<id>")` | identical |

The duplication is intentional today — the two controllers serialize differently (the in-app feed renders markdown excerpts and resolves cover images more aggressively for the masonry layout; the API returns simpler payloads with absolute URLs). Don't merge them blindly; if you change pagination or search, update both and verify neither cursor format broke.

---

## Sorting

### Projects, `sort=active` (default)

"Most recently active" — measured by the latest **public** journal entry's `created_at`. Projects with zero public journals sort last.

Implemented as a LEFT JOIN on a derived `latest_activity` subquery:

```sql
SELECT projects.*, latest_activity.last_activity_at AS explore_activity_at
FROM projects
LEFT JOIN (
  SELECT project_id, MAX(journal_entries.created_at) AS last_activity_at
  FROM journal_entries
  WHERE … public_for_explore conditions …
  GROUP BY project_id
) latest_activity ON latest_activity.project_id = projects.id
WHERE projects.kept AND NOT is_unlisted
ORDER BY latest_activity.last_activity_at DESC NULLS LAST, projects.id DESC
```

The `explore_activity_at` virtual attribute is read off each project row to encode the next cursor.

### Projects, `sort=newest`

`ORDER BY projects.created_at DESC, projects.id DESC`.

### Journals (always `newest`)

`DISTINCT ON (project_id)` to dedupe to one entry per project (the latest), then `ORDER BY created_at DESC, id DESC`. This means **a project never appears twice in the journals feed** — only its newest public entry. Consumers wanting all entries should fetch by `project_id`.

---

## Cursor Pagination

Cursors are opaque base64 strings of the form `<timestamp>|<id>`. The `id` tiebreak is required because timestamps can collide.

### Project cursor (mode-aware)

For `sort=newest`: `iso8601(created_at)|id`. Decode raises `ArgumentError` if the timestamp is missing — the API returns `400 {"error": "Invalid cursor"}`.

For `sort=active`: `iso8601(latest_activity_at)|id`, OR if a project has no public journals, the literal sentinel string `none|id`. Encoder substitutes `PROJECT_ACTIVITY_NULL_CURSOR_VALUE = "none"`. Decoder treats `"none"` as `nil` and dispatches to a different WHERE clause:

```ruby
# Has activity timestamp
WHERE last_activity_at < :cursor_at
   OR (last_activity_at = :cursor_at AND projects.id < :cursor_id)
   OR last_activity_at IS NULL

# No activity (cursor crossed into the NULL region)
WHERE last_activity_at IS NULL AND projects.id < :cursor_id
```

The three-clause OR is the explicit equivalent of `NULLS LAST` semantics in cursor form: rows with a timestamp come first (ordered DESC), then rows with `NULL` (ordered by id DESC).

### Journal cursor

Single mode: `iso8601(created_at)|id`. Same id-tiebreak pattern.

### Cap & "load all" for search

When a query is present:
- The pagination limit is upgraded to `MAX_LIMIT` (50) for that one request (no benefit to small pages when results are already ranked).
- Cursor pagination is **not applied** — Meilisearch returns up to 500 IDs ranked by relevance, and `array_position(...)` preserves that order. Returning `next_cursor: nil` signals "no more pages" even when there are.
- This means there's no way to paginate past the top 500 search hits. Acceptable today because relevance falls off quickly.

---

## Search: Meilisearch with ActiveRecord Fallback

Every search path uses Meilisearch first and falls back to `ActiveRecord` `pg_search` on connection failure or API error:

```ruby
def search_project_ids(query)
  project_ids         = Project.ms_search(query, filter: "is_unlisted = false", sort: ["journal_count:desc", "created_at:desc"], limit: 500).map(&:id)
  journal_project_ids = JournalEntry.ms_search(query, sort: ["created_at:desc"], limit: 500).map(&:project_id).uniq
  (project_ids + (journal_project_ids - project_ids)).uniq  # direct project hits first, then journal-only hits
rescue Meilisearch::ApiError, Errno::ECONNREFUSED
  # pg_search fallback — same shape, slower, no relevance scoring
  ...
end
```

Two-tier ranking for project search: direct matches on project name/description rank above projects only matched via their journal content. Inside each tier, Meilisearch's own score order is preserved.

The `is_unlisted = false` Meilisearch filter is required — without it, unlisted projects can be surfaced via journal-content matches even though they're filtered out of the public scope at SQL time. Belt-and-suspenders, but cheap.

---

## Live Updates (ActionCable)

The in-app feed subscribes to a static stream `bulletin_explore` that fires when public stats might have changed:

```ruby
# app/models/project.rb (also similar in journal_entry.rb)
after_commit :broadcast_bulletin_explore_update

def broadcast_bulletin_explore_update
  return unless bulletin_explore_stats_changed?           # discarded_at, is_unlisted, or new/destroyed
  return unless bulletin_explore_public_now? || bulletin_explore_public_before_last_save?
  ActionCable.server.broadcast("live_updates:bulletin_explore", { stream: "bulletin_explore", action: "update" })
end
```

The "now or before" check is critical: a project transitioning **out of** public visibility (e.g., admin sets `is_unlisted: true`) must still broadcast so the feed can drop it. Conversely, a private project being edited (with `is_unlisted` unchanged) doesn't broadcast.

Frontend (`pages/bulletin_board/index.tsx`) debounces incoming broadcasts at 500ms (`EXPLORE_LIVE_REFRESH_DEBOUNCE_MS`) — a project soft-delete cascading to its journal entries fires multiple after_commits in quick succession, and the user only needs one refresh.

The public `/api/v1/explore/...` API is unaffected by ActionCable — clients poll on their own cadence.

---

## Serialization

### In-app feed (rich)
`serialize_project_for_explore`, `serialize_journal_for_explore` — render markdown excerpts via Nokogiri, resolve cover images via uploaded images or markdown images, build relative `href`s for client navigation. Recording media is NOT exposed on the public explore feed — recordings are restricted to the journal author, project owner, and project collaborators.

### Public API (lean)
`serialize_project`, `serialize_journal` — plain text excerpts, single `cover_image_url` field, absolute URLs (`#{request.base_url}/...`).

### Markdown image extraction (security)
`journal_markdown_image_url` rejects `//evil.example` (protocol-relative) and any `data:`/`javascript:` URLs. Only `http(s)://` and same-origin paths (`/`, `./`, `../`) are returned. Without this, a hostile journal entry could inject an `<img src>` into the public feed that leaks viewer IPs to attacker hosts.

---

## Edge Cases

| Risk | Handling |
|---|---|
| Cursor with missing/garbage timestamp | `Time.iso8601` raises `ArgumentError`; controller rescues → `400 Invalid cursor` |
| Search returning 0 IDs | Both controllers short-circuit and return an empty `data: []` payload (no SQL `IN ()` issue) |
| Project with no public journals in `active` sort | Sorts last via `NULLS LAST`; cursor uses `"none"` sentinel to advance through the NULL region without ambiguity |
| Unlisted project surfaced via journal-content match | `Project.ms_search` filters `is_unlisted = false`; final SQL uses `public_for_explore` regardless |
| Hostile markdown image in public excerpt | URL allowlist (http(s) + same-origin only) before passing to `<img src>` |
| Cascade deletes flooding the cable | Frontend debounces `bulletin_explore` at 500ms |
| Pundit accidentally enabled on these controllers | Explicit `skip_after_action :verify_authorized, only: %i[index search event]` (and same for `:verify_policy_scoped`); the `public_for_explore` scopes are the trust boundary |
| Drift between in-app and public API | The two controllers don't share helpers — when changing pagination/sort/search, audit both |

---

## Where to Touch What

| Change | Controllers / Files |
|---|---|
| New sort option | `BulletinBoardController#order_projects_for_explore` + `Api::V1::ExploreController#order_projects` + `EXPLORE_SORTS`/`SORTS` constants in both |
| Change public visibility rules | `Project#public_for_explore` and/or `JournalEntry#public_for_explore` (cascades everywhere) |
| Add a new explore category | `EXPLORE_CATEGORIES` in both controllers + new `*_explore_entries` method + serializer |
| Adjust live-update sensitivity | `Project#bulletin_explore_stats_changed?` and the parallel method on `JournalEntry` |
| Change cursor format | Both controllers' `encode_*_cursor` / `decode_*_cursor` — clients hold cursors across requests, so format changes break in-flight pagination |

---

## Related

- [arch-bulletin-board.md](arch-bulletin-board.md) — community hub that hosts the in-app feed
- [arch-projects-journals.md](arch-projects-journals.md) — `Project` and `JournalEntry` model details
- [arch-services-infra.md](arch-services-infra.md) — Meilisearch, ActionCable, Inertia
- [docs/developer/api.mdx](../docs/developer/api.mdx) — consumer-facing API reference (the docs *we publish*)
