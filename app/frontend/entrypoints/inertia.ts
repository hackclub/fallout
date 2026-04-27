import { createElement } from 'react'
import { createInertiaApp } from '@inertiajs/react'
import { router } from '@inertiajs/react'
import { createRoot } from 'react-dom/client'
import { renderApp } from '@inertiaui/modal-react'
import * as Sentry from '@sentry/react'
import axios from 'axios'
import DefaultLayout from '../layouts/DefaultLayout'
import { notify } from '../lib/notifications'
import type { ReactNode } from 'react'

axios.defaults.headers.common['X-Browser-Timezone'] = Intl.DateTimeFormat().resolvedOptions().timeZone

// Dev-only re-render overlay — opt in with localStorage.setItem('fallout:react-scan-enabled', 'true').
if (import.meta.env.DEV && localStorage.getItem('fallout:react-scan-enabled') === 'true') {
  import('react-scan').then(({ scan }) => scan({ enabled: true }))
}

// Admin perf badges (rack-mini-profiler + #db-query-badge): toggle with Shift+\ ("|").
// Default visible in both envs; localStorage override persists across page loads.
{
  const STORAGE_KEY = 'fallout:perf-badges-visible'
  const stored = localStorage.getItem(STORAGE_KEY)
  const visible = stored === null ? true : stored === 'true'
  document.documentElement.classList.toggle('perf-badges-hidden', !visible)

  window.addEventListener('keydown', (e) => {
    if (e.key !== '|') return
    const target = e.target as HTMLElement | null
    // Don't swallow | when typing into a field
    if (target?.matches('input, textarea, [contenteditable="true"]')) return
    const nowHidden = document.documentElement.classList.toggle('perf-badges-hidden')
    localStorage.setItem(STORAGE_KEY, (!nowHidden).toString())
  })

  // Inertia visits return both X-Perf-Stats (short) + X-Perf-Stats-Long (expanded) for admins.
  axios.interceptors.response.use((response) => {
    const stats = response.headers['x-perf-stats']
    const long = response.headers['x-perf-stats-long']
    const badge = document.getElementById('db-query-badge')
    if (badge) {
      const shortEl = badge.querySelector('.short')
      const longEl = badge.querySelector('.long')
      if (shortEl && stats) shortEl.textContent = stats
      if (longEl && long) longEl.textContent = long
    }
    return response
  })

  // Click the badge to toggle short/expanded view; persists for the session in localStorage.
  const EXPAND_KEY = 'fallout:perf-badge-expanded'
  const applyExpanded = () => {
    const badge = document.getElementById('db-query-badge')
    if (!badge) return
    badge.classList.toggle('expanded', localStorage.getItem(EXPAND_KEY) === 'true')
  }
  applyExpanded()
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null
    if (!target?.closest('#db-query-badge')) return
    const isExpanded = localStorage.getItem(EXPAND_KEY) === 'true'
    localStorage.setItem(EXPAND_KEY, (!isExpanded).toString())
    applyExpanded()
  })
  // Re-apply on Inertia page swaps in case the badge gets re-rendered without the class
  router.on('success', applyExpanded)
}

// Dev-only floating toggles (bottom-left). Each persists its state in localStorage.
if (import.meta.env.DEV) {
  const baseStyle = [
    'position:fixed',
    'left:0.5rem',
    'z-index:9999',
    'padding:4px 8px',
    'background:rgba(97,69,58,0.85)',
    'color:#fcf1e5',
    'border:1px solid #61453a',
    'border-radius:4px',
    'font:11px ui-monospace,SFMono-Regular,Menlo,monospace',
    'cursor:pointer',
    'opacity:0.6',
    'transition:opacity 0.15s ease',
  ].join(';')

  const wireHover = (btn: HTMLButtonElement) => {
    btn.addEventListener('mouseenter', () => (btn.style.opacity = '1'))
    btn.addEventListener('mouseleave', () => (btn.style.opacity = '0.6'))
  }

  // AnnouncementsBar hide toggle.
  {
    const STORAGE_KEY = 'fallout:announcements-hidden'

    const button = document.createElement('button')
    button.id = 'dev-announcements-toggle'
    button.type = 'button'
    button.style.cssText = `${baseStyle};bottom:0.5rem`
    wireHover(button)

    const apply = () => {
      const hidden = localStorage.getItem(STORAGE_KEY) === 'true'
      document.documentElement.classList.toggle('announcements-hidden', hidden)
      button.textContent = hidden ? 'Show announcements' : 'Hide announcements'
      button.title = hidden ? 'Show the announcements bar' : 'Hide the announcements bar'
    }

    button.addEventListener('click', () => {
      const nowHidden = !(localStorage.getItem(STORAGE_KEY) === 'true')
      localStorage.setItem(STORAGE_KEY, nowHidden.toString())
      apply()
    })

    document.body.appendChild(button)
    apply()
  }

  // react-scan toggle. Reload-based: the gate at the top of this file reads localStorage on boot.
  {
    const STORAGE_KEY = 'fallout:react-scan-enabled'

    const button = document.createElement('button')
    button.id = 'dev-react-scan-toggle'
    button.type = 'button'
    button.style.cssText = `${baseStyle};bottom:2rem`
    wireHover(button)

    const apply = () => {
      const enabled = localStorage.getItem(STORAGE_KEY) === 'true'
      button.textContent = enabled ? 'Disable react-scan' : 'Enable react-scan'
      button.title = enabled
        ? 'Turn off the react-scan overlay (reloads page)'
        : 'Turn on the react-scan overlay (reloads page)'
    }

    button.addEventListener('click', () => {
      const nowEnabled = !(localStorage.getItem(STORAGE_KEY) === 'true')
      localStorage.setItem(STORAGE_KEY, nowEnabled.toString())
      location.reload()
    })

    document.body.appendChild(button)
    apply()
  }
}

// sessionStorage can be blocked in sandboxed/privacy contexts; catch gracefully so Inertia doesn't crash
window.addEventListener('unhandledrejection', (event) => {
  if (
    event.reason instanceof DOMException &&
    event.reason.name === 'SecurityError' &&
    event.reason.message.includes('sessionStorage')
  ) {
    event.preventDefault()
    notify(
      'alert',
      'There was an error! Your browser is blocking storage access. Please disable private/strict mode and reload.',
    )
  }
})

Sentry.init({
  dsn: document.querySelector<HTMLMetaElement>('meta[name="sentry-dsn"]')?.content,
  release: __SENTRY_RELEASE__ ?? undefined, // Ties events + source maps to the same git SHA
  integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration(), Sentry.replayCanvasIntegration()],
  tracesSampleRate: 0.2,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
})

// Bullet N+1 alerts: Inertia uses axios (XHR). Bullet.console sets X-bullet-console-text headers
// on non-HTML responses. Patch XHR to read that header and show toast notifications.
if (import.meta.env.DEV) {
  const originalSend = XMLHttpRequest.prototype.send
  XMLHttpRequest.prototype.send = function (...args: Parameters<XMLHttpRequest['send']>) {
    this.addEventListener('load', function () {
      const bulletText = this.getResponseHeader('X-bullet-console-text')
      if (bulletText) {
        try {
          JSON.parse(bulletText).forEach((msg: string) => notify('alert', msg))
        } catch {
          notify('alert', bulletText)
        }
      }
    })
    return originalSend.apply(this, args)
  }
}

router.on('exception', (event) => {
  Sentry.captureException(event.detail.exception)
  notify('alert', 'A network error occurred. Please check your connection and try again.')
})

router.on('navigate', (event) => {
  Sentry.addBreadcrumb({
    category: 'navigation',
    message: event.detail.page.url,
    level: 'info',
  })
})

// Capture each Inertia client-side visit as its own Sentry navigation transaction.
// browserTracingIntegration only auto-instruments the initial pageload — without this hook,
// every subsequent SPA visit is invisible in Sentry Performance.
router.on('start', (event) => {
  const client = Sentry.getClient()
  if (!client) return
  Sentry.startBrowserTracingNavigationSpan(client, {
    name: event.detail.visit.url.pathname,
    op: 'navigation.inertia',
  })
})

interface PageModule {
  default: { layout?: (page: ReactNode) => ReactNode }
}

createInertiaApp({
  resolve: (name) => {
    const pages = import.meta.glob<PageModule>('../pages/**/*.tsx', { eager: true })
    const page = pages[`../pages/${name}.tsx`]
    if (!page) {
      console.error(`Missing Inertia page component: '${name}.tsx'`)
    }

    // Apply DefaultLayout to pages that don't define their own (admin pages set AdminLayout themselves).
    if (page && !page.default.layout) {
      page.default.layout = (p: ReactNode) => createElement(DefaultLayout, null, p)
    }
    return page
  },

  setup({ el, App, props }) {
    if (el) {
      createRoot(el).render(
        createElement(
          Sentry.ErrorBoundary,
          {
            fallback: createElement(
              'div',
              { className: 'flex min-h-screen items-center justify-center text-center' },
              createElement(
                'div',
                null,
                createElement('h1', { className: 'text-2xl font-bold text-brown' }, 'Something went wrong'),
                createElement(
                  'p',
                  { className: 'mt-2 text-dark-brown' },
                  "We're going to debug what happened... Please try later.",
                ),
              ),
            ),
          },
          renderApp(App, props),
        ),
      )
    }
  },

  defaults: {
    form: {
      forceIndicesArrayFormatInFormData: false,
    },
    future: {
      useDialogForErrorModal: true,
      preserveEqualProps: true,
    },
  },
})
