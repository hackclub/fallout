---
name: Frontend Architecture
description: React 19 + Inertia + Tailwind 4 frontend — page structure, component library, styling system, state management, build pipeline
type: project
---

# Frontend Architecture

React 19 + TypeScript rendered via Inertia Rails. No client-side router — Rails controllers pass props directly to React page components. Vite 7.3.1 with SWC for compilation.

## How Inertia Works Here

1. Rails controller renders `inertia: { prop: value }` (or uses `default_render`)
2. Inertia middleware serializes props + component name into JSON
3. Client resolves component via `import.meta.glob('../pages/**/*.tsx')`
4. Component path: `{controller_name}/{action_name}` (e.g., `projects/show`)
5. On navigation: Inertia makes XHR request, swaps component + props without full page reload

**Config** (`config/initializers/inertia_rails.rb`):
- `encrypt_history = true` — back button can't leak stale data
- `always_include_errors_hash = true` — form validation errors always available
- `component_path_resolver` — `"#{path.underscore}/#{action.underscore}"`
- `version` = `ViteRuby.digest` — cache-busts on deploy

## Entrypoint — `app/frontend/entrypoints/inertia.ts`

- Initializes Sentry (browserTracing, replayOnError, canvas replay)
- `renderApp()` from modal fork (wraps Inertia's `createInertiaApp`)
- Dynamic page resolution: `import.meta.glob('../pages/**/*.tsx')`
- Default layout: `DefaultLayout` unless page exports its own `layout`
- Handles `sessionStorage` SecurityError (Safari private browsing)

## Layouts

### DefaultLayout — `app/frontend/layouts/DefaultLayout.tsx`
- Sentry error boundary wrapper
- Renders `FlashMessages` (toast notifications)
- Sets Sentry user context from `auth.user`
- Minimal: `div.min-h-screen` with children

### MarkdownLayout — `app/frontend/layouts/MarkdownLayout.tsx`
- Sidebar navigation with collapsible sections (persisted to localStorage)
- Mobile hamburger menu with slide-out nav
- `DocProgressBar` reading progress indicator

## Page Components — `app/frontend/pages/`

26 page files organized by controller:

| Domain | Pages | Notes |
|---|---|---|
| **Path** | `path/index.tsx`, `path/verify.tsx` | Main 3D experience, account verification |
| **Projects** | `projects/index.tsx`, `show.tsx`, `form.tsx`, `onboarding/index.tsx` | CRUD + collaborator management |
| **Journal** | `journal_entries/new.tsx` | Dual-pane book layout: editor + media browser |
| **Collaboration** | `collaboration_invites/show.tsx` | Accept/decline |
| **Onboarding** | `onboarding/show.tsx` | Multi-step wizard |
| **Notifications** | `mails/index.tsx`, `mails/show.tsx` | Inbox + detail |
| **Critters** | `critters/show.tsx` | Gacha reveal animation |
| **Clearing** | `clearing/index.tsx` | Critter gallery |
| **Landing** | `landing/index.tsx` | Public marketing page with GSAP animations |
| **Lookout** | `lookout_sessions/show.tsx` | Recording playback |
| **Admin** | `admin/users/`, `admin/projects/`, `admin/ships/`, `admin/static_pages/` | Staff dashboards |
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

```typescript
interface SharedProps {
  auth: { user: User | null }  // User: id, display_name, email, avatar, roles, is_admin, is_staff, is_banned, is_trial, is_onboarded
  flash: { alert?: string; notice?: string }
  features: { collaborators?: boolean; lookout?: boolean }  // empty {} for trial users
  sign_in_path: string          // includes login_hint for trial users
  sign_out_path: string
  trial_session_path: string
  rsvp_path: string
  has_unread_mail: boolean      // false for trial users
  errors: Record<string, string[]>
  [key: string]: unknown
}
```

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

**Fonts**: Google Sans (default), Outfit, Hells Bells (decorative), Comico (decorative)

**Additional colors** (not in the primary palette table above):
- `--color-dark-blue: #007BDA`
- `--color-black: #61453a` (same as dark-brown — semantic alias)

**Custom breakpoints** (smaller than Tailwind defaults):
- `--breakpoint-2xs: 320px`
- `--breakpoint-xs: 480px`

**Rules:**
- Use only theme colors — no hex codes or arbitrary values (`bg-[#abc]`)
- No opacity modifiers (`bg-dark-brown/50`) — if a shade is needed, ask for a new theme color
- Root: `bg-light-brown text-dark-brown`

## Build Pipeline — `vite.config.ts`

```typescript
plugins: [react(), tailwindcss(), RubyPlugin(), sentryVitePlugin()]
resolve.alias: { '@': 'app/frontend' }
build.sourcemap: true
```

Path alias: `@/*` → `app/frontend/*` (configured in vite.config.ts). Note: `~/*` exists in `tsconfig.json` for IDE type-checking but is **not** in the Vite config, so it only works for TypeScript resolution, not runtime imports. Use `@/` for all imports.

## Undocumented Components

Components that exist but aren't in the primary tables above:
- `TableOfContents.tsx` — TOC sidebar for markdown docs
- `SpeechBubble.tsx` — speech bubble UI for onboarding dialogue steps
- `DocProgressBar.tsx` — reading progress indicator
- Two `Pagination.tsx` files exist: `components/Pagination.tsx` and `components/shared/Pagination.tsx` — the shared one is the primary component used by pages.

## Custom Hooks — `app/frontend/hooks/`

- `useClickOutside.ts` — click-outside + Escape key detection, returns ref

## Local Packages — `packages/`

| Package | Purpose |
|---|---|
| `inertiaui-modal-react/` | Forked modal system (see above) |
| `lookout-react/` | Lookout video recording UI components |
| `lookout-shared/` | Shared Lookout utilities |
