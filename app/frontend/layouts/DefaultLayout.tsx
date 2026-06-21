import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { usePage } from '@inertiajs/react'
import * as Sentry from '@sentry/react'
import FlashMessages from '@/components/FlashMessages'
import ImpersonationBanner from '@/components/ImpersonationBanner'
import type { SharedProps } from '@/types'

export default function DefaultLayout({ children }: { children: ReactNode }) {
  const { auth } = usePage<SharedProps>().props

  useEffect(() => {
    if (auth.user) {
      Sentry.setUser({ id: String(auth.user.id) })
    } else {
      Sentry.setUser(null)
    }
  }, [auth.user?.id])

  return (
    <div className="min-h-screen">
      <ImpersonationBanner />
      <FlashMessages />
      <main>{children}</main>
    </div>
  )
}
