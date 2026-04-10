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

    page.default.layout = page.default.layout || ((p: ReactNode) => createElement(DefaultLayout, null, p))
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
