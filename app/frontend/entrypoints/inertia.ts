import { createElement } from 'react'
import { createInertiaApp } from '@inertiajs/react'
import { router } from '@inertiajs/react'
import { createRoot } from 'react-dom/client'
import { renderApp } from '@inertiaui/modal-react'
import * as Sentry from '@sentry/react'
import DefaultLayout from '../layouts/DefaultLayout'
import type { ReactNode } from 'react'

Sentry.init({
  dsn: document.querySelector<HTMLMetaElement>('meta[name="sentry-dsn"]')?.content,
  integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration(), Sentry.replayCanvasIntegration()],
  tracesSampleRate: 0.2,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
})

router.on('exception', (event) => {
  Sentry.captureException(event.detail.exception)
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
