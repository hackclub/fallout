import type { FlashData, SharedProps } from '@/types'

declare module '@inertiajs/core' {
  export interface InertiaConfig {
    sharedPageProps: SharedProps
    flashDataType: FlashData
    errorValueType: string[]
  }
}

declare global {
  // Injected by vite.config.ts via `define` — git SHA or null when unavailable
  const __SENTRY_RELEASE__: string | null
}
