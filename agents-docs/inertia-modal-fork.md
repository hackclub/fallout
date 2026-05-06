# Inertia Modal Fork

Local fork of `@inertiaui/modal-react@1.0.0-beta-5` at `packages/inertiaui-modal-react/`.

## Why a fork?

The upstream package hardcodes 300ms animation duration with no way to configure it. We vendored the source locally to add custom props.

## Setup

- `package.json` points `@inertiaui/modal-react` at `file:packages/inertiaui-modal-react`
- The fork imports source directly (no build step) — the project's vite handles JSX transpilation
- `config.js` and `helpers.js` were inlined because upstream re-exports from a `../../vue/src/` monorepo path that doesn't exist in the published package
- `@headlessui/react` and `clsx` added as direct dependencies (were previously bundled in the dist)

## Custom Props

### `duration` (number, default: 300)

Controls transition animation duration in milliseconds. When `duration !== 300`, a scoped `<style>` tag is injected with `transition-duration: Xms !important` to override Tailwind's `duration-300` class. Inline `style` props don't work because HeadlessUI v2 clobbers them during transition management.

```jsx
<Modal duration={0}>...</Modal>        // instant, no animation
<Modal duration={150}>...</Modal>      // fast
<Modal>...</Modal>                     // default 300ms

<ModalLink href="/path" duration={0}>  // also works on ModalLink
```

**Implementation approach:** Scoped `<style>` injection with unique class per instance (`useId()` in content components, modal `id` for backdrop). The class is added to the `TransitionChild` element's `className` and the `<style>` tag applies `!important` to override `duration-300`.

**Files modified for this prop:**
- `HeadlessModal.jsx` — added `duration` to config object
- `ModalRoot.jsx` — added `'duration'` to `modalPropNames` array
- `Modal.jsx` — backdrop `TransitionChild` gets scoped duration class via `enter`/`leave` props
- `ModalContent.jsx` — modal wrapper gets scoped `<style>` + class on `TransitionChild`
- `SlideoverContent.jsx` — same pattern as ModalContent

**Type definition:** `duration?: number` added to `Modal` props in `app/frontend/types/inertia-modal.d.ts`

### In-Modal Navigation (`navigate`, `goBack`, `replace`)

Allows swapping content inside an open modal without creating nested modals. The Transition/Dialog stay mounted — no close/reopen animation. Think iframe-like navigation within a stable modal container.

**How it works:**
- `Modal` class (in `ModalRoot.jsx`) stores `navigatedContent` (current navigated page) and `navigationHistory` (stack for back navigation)
- `modal.navigate(url, options)` fetches via Axios with modal headers, resolves the Inertia component, pushes current state to history, sets `navigatedContent`, triggers re-render
- `Modal.jsx` checks `modalContext.navigatedContent` — when set, renders `<NavigatedComponent>` instead of original children, inside the existing `<ModalContent>`/`<SlideoverContent>` wrapper
- Progress bar (`InertiaReact.progress.start()`/`.finish()`) fires during navigation
- `goBack()` pops from history, `canGoBack` checks history length

**`replace` prop on `<ModalLink>`:** When `replace={true}` and the link is inside a modal, it calls `stack[modalIndex].navigate()` instead of opening a new nested modal.

**`NavigatedModalContext` (transparent child Modal handling):** When a page is rendered as navigated content inside a modal, its own `<Modal>` component detects a `NavigatedModalContext` parent and automatically skips Dialog/Transition/backdrop (since the parent already provides those). Instead, it renders just `<ModalContent>` or `<SlideoverContent>` with its own config (panelClasses, maxWidth, etc.), falling back to the parent's config for unset values. This means page authors don't need to check `_navigatedInModal` — a page's `<Modal>` works identically whether opened standalone or navigated into via `replace`.

```jsx
// Pages just use <Modal> normally — no special handling needed
if (is_modal) {
  return <Modal panelClasses="h-full" maxWidth="7xl"><Frame>{content}</Frame></Modal>
}
return content
```

**Files modified:**
- `ModalRoot.jsx` — `navigatedContent`, `navigationHistory`, `navigate()`, `goBack()`, `canGoBack` on Modal class; `navigateModal()` on context value; `'replace'` added to `modalPropNames`
- `Modal.jsx` — `NavigatedModalContext` created via `createContext(null)`; parent Modal wraps `NavigatedComponent` in `<NavigatedModalContext.Provider>` passing `{ modalContext, config, close, navigate, goBack, canGoBack }`; child Modals check `useContext(NavigatedModalContext)` and render ModalContent/SlideoverContent with their own config when inside navigated content; passes `navigate`/`goBack`/`canGoBack` to children render props; merges navigated config with base config
- `HeadlessModal.jsx` — exposes `navigate`, `goBack`, `canGoBack` in render props and imperative handle
- `ModalRenderer.jsx` — `useModalIndex()` returns `null` instead of throwing when outside context (so ModalLink can detect if it's inside a modal)
- `ModalLink.jsx` — `replace` prop; when true + inside modal, calls `navigate()` instead of `visit()`

**Type definitions:** `replace?: boolean` on ModalLink, `navigate`/`goBack`/`canGoBack` on useModal return type, `useModalIndex` export — all in `app/frontend/types/inertia-modal.d.ts`
