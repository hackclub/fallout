import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { defineConfig } from 'vite'
import RubyPlugin from 'vite-plugin-ruby'
import { resolve } from 'path'
import { execSync } from 'node:child_process'

// Resolve a Sentry release ID for source map → release association.
// Order: explicit SENTRY_RELEASE env var → git SHA → undefined (plugin uploads untagged).
function detectSentryRelease(): string | undefined {
  if (process.env.SENTRY_RELEASE) return process.env.SENTRY_RELEASE
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return undefined
  }
}
const sentryRelease = detectSentryRelease()

export default defineConfig({
  build: {
    sourcemap: true,
  },
  // Inject the release into the client bundle so Sentry.init can tag events with it.
  define: {
    __SENTRY_RELEASE__: JSON.stringify(sentryRelease ?? null),
  },
  plugins: [
    react(),
    tailwindcss(),
    RubyPlugin(),
    sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      release: sentryRelease ? { name: sentryRelease } : undefined,
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'app/frontend'),
    },
  },
})
