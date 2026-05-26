import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { usePage } from '@inertiajs/react'
import * as Sentry from '@sentry/react'
import FlashMessages from '@/components/FlashMessages'
import { useAdminDark } from '@/hooks/useAdminDark'
import type { SharedProps } from '@/types'
import '@/styles/admin.css'

export default function ReviewLayout({ children }: { children: ReactNode }) {
  const { auth } = usePage<SharedProps>().props
  // Key on pathname only so in-place filter / search updates don't re-fire the page-enter animation.
  const pageKey = usePage().url.split('?')[0]
  useAdminDark()

  useEffect(() => {
    document.title = 'Fallout Review'
  }, [])

  useEffect(() => {
    if (auth.user) {
      Sentry.setUser({ id: String(auth.user.id) })
    } else {
      Sentry.setUser(null)
    }
  }, [auth.user?.id])

  return (
    <div className="admin bg-background text-foreground min-h-screen flex flex-col">
      <FlashMessages />
      <div key={pageKey} className="t-admin-page flex-1 flex flex-col">
        {children}
      </div>
    </div>
  )
}
