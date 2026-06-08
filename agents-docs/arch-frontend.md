---
name: Frontend Architecture
description: React 19 + Inertia + Tailwind 4 frontend — page structure, component library, styling system, state management, build pipeline
type: project
---

# Frontend Architecture

React 19 + TypeScript rendered via Inertia Rails. No client-side router — Rails controllers pass props directly to React page components. Vite 8 with SWC (`@vitejs/plugin-react-swc`) for compilation.

## How Inertia Works Here

1. Rails controller renders `inertia: { prop: value }` (or uses `default_render`)
2. Inertia middleware serializes props + component name into JSON
3. Client resolves component via `import.meta.glob('../pages/**/*.tsx', { eager: true })`
4. Component path: `{controller_name}/{action_name}` (e.g., `projects/show`)
5. On navigation: Inertia makes XHR request, swaps component + props without full page reload

**Config** (`config/initializers/inertia_rails.rb`):
- `encrypt_history = true` — back button can't leak stale data
- `always_include_errors_hash = true` — form validation errors always available
- `component_path_resolver` — `"#{path.underscore}/#{action.underscore}"`
- `version` = `ViteRuby.digest` — cache-busts on deploy

## Entrypoint — `app/frontend/entrypoints/inertia.ts`

- Initializes Sentry (browserTracing, replayOnError, canvas replay); tags events with `__SENTRY_RELEASE__` (git SHA injected by `vite.config.ts`) and starts a navigation transaction on each Inertia visit
- `renderApp()` from modal fork (wraps Inertia's `createInertiaApp`), inside a `Sentry.ErrorBoundary`
- Eager page resolution: `import.meta.glob('../pages/**/*.tsx', { eager: true })`
- Default layout: `DefaultLayout` unless page exports its own `layout` (admin pages set `AdminLayout` themselves)
- Sets `X-Browser-Timezone` axios header from the browser timezone
- Handles `sessionStorage` SecurityError (Safari private browsing) via `unhandledrejection`
- Dev-only: Bullet N+1 toast alerts (reads `X-bullet-console-text`), react-scan overlay toggle, AnnouncementsBar hide toggle (bottom-left floating buttons)
- Perf badges (rack-mini-profiler / `#db-query-badge`): reads `X-Perf-Stats`/`X-Perf-Stats-Long` response headers, toggled with `Shift+\`
- Inertia `defaults.future`: `useDialogForErrorModal`, `preserveEqualProps`

## Layouts

### DefaultLayout — `app/frontend/layouts/DefaultLayout.tsx`
- Sentry error boundary wrapper
- Renders `FlashMessages` (toast notifications)
- Sets Sentry user context from `auth.user`
- Minimal: `div.min-h-screen` with children

### MarkdownLayout — `app/frontend/layouts/MarkdownLayout.tsx`
- Sidebar navigation with collapsible sections (persisted to localStorage)
- Mobile hamburger menu with slide-out nav (`Frame`-wrapped)
- `DocProgressBar` reading progress indicator
- `⌘K`/`Ctrl+K` doc search (`DocSearch` modal over `search_index` prop)

### AdminLayout — `app/frontend/layouts/AdminLayout.tsx`
- shadcn/ui-based chrome for the `/admin` dashboard; pages set it via their own `layout` export
- Dark-mode aware (`useAdminDark` hook)

### ReviewLayout — `app/frontend/layouts/ReviewLayout.tsx`
- Layout for the admin review queues (time audits, requirements checks, design/build reviews)

## Page Components — `app/frontend/pages/`

~80 page files organized by controller. Pages live at `pages/{controller}/{action}.tsx`; some directories also contain co-located non-page components (e.g. form sheets) imported by their pages. Highlights:

| Domain | Pages | Notes |
|---|---|---|
| **Path** | `path/index.tsx`, `path/verify.tsx` | Main 3D experience, account verification |
| **Projects** | `projects/index.tsx`, `show.tsx`, `form.tsx`, `onboarding/index.tsx`, `ships/preflight.tsx` | CRUD, collaborators, ship preflight |
| **Journal** | `journal_entries/new.tsx` | Dual-pane book layout: editor + media browser |
| **Collaboration** | `collaboration_invites/show.tsx`, `pending_collaboration_invites/show.tsx` | Accept/decline + pending |
| **Onboarding** | `onboarding/show.tsx` | Multi-step wizard |
| **Notifications** | `mails/index.tsx`, `mails/show.tsx` | Inbox + detail |
| **Critters / Clearing** | `critters/show.tsx`, `clearing/index.tsx` | Gacha reveal, critter gallery |
| **Landing** | `landing/index.tsx` | Public marketing page with GSAP animations |
| **Lookout** | `lookout_sessions/show.tsx` | Recording playback |
| **Bulletin board** | `bulletin_board/index.tsx`, `bulletin_board/events/show.tsx` | Events (with `.module.scss` styles) |
| **Shop** | `shop/index.tsx`, `show.tsx`, `claim_ticket.tsx`, `shop_orders/new.tsx`, `shop_orders/show.tsx` | Koi shop + orders |
| **Project grants / Top-ups** | `project_grants/`, `top_ups/` | HCB-backed grant funding (see HCB docs) |
| **Profiles / Streaks / Professors** | `profiles/show.tsx`, `streak_goals/show.tsx`, `professor_enrollments/new.tsx` | |
| **Soup campaigns** | `soup_campaign_unsubscribe/` | Unsubscribe flow |
| **Admin** | `admin/users/`, `admin/projects/`, `admin/ships/`, `admin/dashboard/`, `admin/reviews/{time_audits,requirements_checks,design_reviews,build_reviews}/`, `admin/project_grants/`, `admin/shop_items/`, `admin/shop_orders/`, `admin/koi_transactions/`, `admin/soup_campaigns/`, `admin/featured_projects/`, `admin/bulletin_events/`, `admin/project_flags/`, `admin/hours_stats/`, `admin/ticket_claims/`, `admin/reviewers/`, `admin/activity_checks/`, `admin/unified_inspect.tsx` | Staff dashboards + review queues |
| **Other** | `home/index.tsx`, `bans/show.tsx`, `markdown/show.tsx` | Misc |

## Shared Components — `app/frontend/components/`

### UI Primitives (`components/shared/`)

| Component | What it does |
|---|---|
| `Button.tsx` | Primary/link variants, `twMerge` for class composition, brown theme |
| `Input.tsx` | Text input with brown border styling |
| `TextArea.tsx` | Textarea wrapper (same styling as Input) |
| `Checkbox.tsx` | Custom styled with hidden native input |
| `Frame.tsx` | Decorative wooden border frame (corner + edge images, scrollable) |
| `FrameLayout.tsx` | Frame wrapper layout |
| `Tooltip.tsx` | Context-based API with auto-flip positioning, portal rendering, scroll tracking |
| `MarkdownEditor.tsx` | Rich editor with syntax support, image upload via DirectUpload, live preview |
| `Pagination.tsx` | Pagy-backed page navigation |
| `BookLayout.tsx` | Book-style content layout |
| `Confetti.tsx` | Confetti burst effect |
| `InlineUser.tsx` | Inline avatar + display name chip |
| `TimeAgo.tsx` | Relative timestamp (paired with `lib/relativeAge.ts`) |
| `Timeline.tsx` | Vertical event timeline |
| `ProgressBar.tsx` / `ProjectProgressBar.tsx` | Progress indicators |
| `SlidingNumber.tsx` / `TextMorph.tsx` | Animated number / text transitions |
| `MarqueeText.tsx` | Scrolling marquee text (`.module.scss`) |
| `ImagePlaceholder.tsx` | Placeholder for loading images |

### Top-Level Components

| Component | What it does |
|---|---|
| `FlashMessages.tsx` | Global toast system — subscribes to pub/sub, auto-dismiss 4s, alert (red) / notice (green) |
| `Nav.tsx` | Navigation with auth state, trial/verified status, sign out |
| `HalftoneBg.tsx` | WebGL2 CMYK halftone canvas effect with mouse-proximity pixel sizing |
| `Projects.tsx` | Project list container |
| `Shop.tsx` | Placeholder shop frame |

### Notification Pub/Sub — `app/frontend/lib/notifications.ts`

Global `notify(type, message)` function with `subscribe()` for listeners. Pending queue for pre-mount notifications. Used by `FlashMessages` and inline button handlers.

## Modal System — Local Fork

`packages/inertiaui-modal-react/` — forked from `@inertiaui/modal-react@1.0.0-beta-5`.

See [inertia-modal-fork.md](inertia-modal-fork.md) for full details. Key additions:
- **`duration` prop** — controls animation speed (default 300ms). Uses scoped `<style>` injection because HeadlessUI clobbers inline styles.
- **In-modal navigation** — `modal.navigate(url)` swaps content inside an open modal without close/reopen. History stack with `goBack()`. `<ModalLink replace>` triggers this.
- **`NavigatedModalContext`** — child `<Modal>` inside navigated content auto-skips Dialog/Transition, rendering just its ModalContent inside the parent's container.

## State Management

**Minimal, Inertia-first:**
- `usePage<SharedProps>()` — server-provided page + shared props (auth, flash, features, errors)
- `useForm()` — Inertia form state, submission, error handling
- Local `useState`/`useRef` for UI-only state
- `PathCenterContext` — provides center X for billboard rendering
- No Redux/Zustand — everything is props-driven, server-authoritative

## Shared Props (available on every page)

Defined in `app/frontend/types/index.ts`:

```typescript
interface SharedProps {
  auth: { user: User | null }  // User: id, display_name, avatar, roles, is_admin, is_staff,
                               //   is_banned, ban_type, is_trial, is_onboarded, professor_enrolled,
                               //   professor_recently_enrolled, professor_enrollment_eligible
  flash: FlashData             // Record<string, string> (alert / notice keys)
  features: Features           // { collaborators?, shop?, grant_fulfillment }
  sign_in_path: string         // includes login_hint for trial users
  sign_out_path: string
  trial_session_path: string
  rsvp_path: string
  has_unread_mail: boolean     // false for trial users
  current_streak: number
  unsubmitted_hours: number | null
  streak_freezes: number
  identity_gate: IdentityGate | null  // identity verification gating state
  show_feedback_banner: boolean
  errors: Record<string, string[]>
  [key: string]: unknown
}
```

Note: `email` is NOT on the shared `User` type — PII is only serialized into admin-only props (see `AdminUserRow`/`AdminUserDetail`, which carry optional `email`).

**IMPORTANT**: `sign_in_path`, `sign_out_path`, `trial_session_path`, `rsvp_path` are **top-level** props, NOT nested under `auth`. Access as `shared.sign_in_path`, not `shared.auth.sign_in_path`.

**Security**: all shared props visible in browser devtools. Tokens (`hca_token`, `lapse_token`) are never included.

## Styling — Tailwind 4

**Theme** defined in CSS (`app/frontend/styles/application.css`), not config file:

```css
@theme {
  --color-dark-brown: #61453a;   --color-brown: #9f715d;
  --color-light-brown: #edd1b0;  --color-beige: #FCF1E5;
  --color-blue: #38C9FF;         --color-light-blue: #C3EFFF;
  --color-green: #37B576;        --color-light-green: #C8E6D8;
  --color-yellow: #ffebad;       --color-pink: #fc90d2;
  --color-coral: #ff7d70;        --color-gray: #777777;
}
```

The `@theme` block lives in `app/frontend/styles/application.css`. A separate `@theme inline` block above it maps shadcn/ui CSS variables (`--color-background`, `--color-primary`, radius scale, etc.) for the admin dashboard. Admin-specific styling lives in `app/frontend/styles/admin.css`.

**Fonts**: Google Sans (default / `--font-sans` + `--font-google`), Outfit, Hells Bells (decorative), Comico (decorative)

**Additional colors** (not in the primary palette table above):
- `--color-dark-blue: #007BDA`, `--color-lighter-blue: #edf7fb`, `--color-ice-blue: #00a2ff`
- `--color-dark-yellow: #ef9300`
- `--color-black: #61453a` (same as dark-brown — semantic alias)
- `--color-backdrop: rgba(65, 88, 97, 0.5)` (modal/overlay backdrop)
- `--radius-4xl: 2rem`

**Custom breakpoints** (smaller than Tailwind defaults):
- `--breakpoint-2xs: 320px`
- `--breakpoint-xs: 480px`

**Rules:**
- Use only theme colors — no hex codes or arbitrary values (`bg-[#abc]`)
- No opacity modifiers (`bg-dark-brown/50`) — if a shade is needed, ask for a new theme color
- Root: `bg-light-brown text-dark-brown`

## Build Pipeline — `vite.config.ts`

```typescript
plugins: [react(), tailwindcss(), RubyPlugin(), sentryVitePlugin({ org, project, authToken, release })]
resolve.alias: { '@': 'app/frontend' }
build.sourcemap: true
define: { __SENTRY_RELEASE__: <git SHA or SENTRY_RELEASE env, JSON-stringified> }
```

`detectSentryRelease()` resolves a release ID (`SENTRY_RELEASE` env → git SHA → undefined) used both to tag the Sentry plugin upload and to inject `__SENTRY_RELEASE__` into the client bundle so `Sentry.init` tags events with the matching SHA.

Path alias: `@/*` → `app/frontend/*` (configured in vite.config.ts). Note: `~/*` exists in `tsconfig.json` for IDE type-checking but is **not** in the Vite config, so it only works for TypeScript resolution, not runtime imports. Use `@/` for all imports.

## Component Subdirectories

Beyond `components/shared/` and the top-level components, components are grouped by domain:
- `components/admin/` — shadcn/ui primitives (`admin/ui/`) + admin-specific UI; see the admin styling rules in AGENTS.md
- `components/path/` — 3D Path scene (`Path.tsx`, `PathNode.tsx`, etc.); exports `PathCenterContext`
- `components/onboarding/` — wizard steps (`DialogueStep`, `SingleChoiceStep`, `MultiChoiceStep`, `NavigationButtons`, `ProfessorEnrollmentCtaStep`) and `SpeechBubble.tsx`
- `components/docs/` — markdown doc chrome: `DocProgressBar.tsx`, `DocSearch.tsx`, `DocVideo.tsx`, `TableOfContents.tsx`
- `components/announcements/` — announcements bar
- `components/bulletin_board/` — bulletin board UI

Note: two `Pagination.tsx` files exist (`components/Pagination.tsx` and `components/shared/Pagination.tsx`) — the shared one is the primary component used by pages.

## Custom Hooks — `app/frontend/hooks/`

- `useClickOutside.ts` — click-outside + Escape key detection, returns ref
- `useDebouncedValue.ts` — debounced value
- `useDialogue.ts` — onboarding dialogue/typewriter state
- `use-mobile.ts` — mobile breakpoint detection (admin/shadcn)
- `useAdminDark.ts` — admin dark-mode state
- `useReviewHeartbeat.ts` — keeps a review claim alive while reviewing
- `useReviewShortcuts.ts` — keyboard shortcuts for review queues

Some hook-like helpers also live under `app/frontend/lib/` (e.g. `useColorLerp.ts`, `useLiveReload.ts`, `useNowTick.ts`).

## Local Packages — `packages/`

| Package | Purpose |
|---|---|
| `inertiaui-modal-react/` | Forked modal system (see above) |
| `lookout-react/` | Lookout video recording UI components |
| `lookout-shared/` | Shared Lookout utilities |
