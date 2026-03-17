import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { usePage } from '@inertiajs/react'
import * as Sentry from '@sentry/react'
import FlashMessages from '@/components/FlashMessages'
import type { SharedProps } from '@/types'

export default function DefaultLayout({ children }: { children: ReactNode }) {
  const { auth } = usePage<SharedProps>().props

  useEffect(() => {
    if (auth.user) {
      Sentry.setUser({ id: String(auth.user.id), email: auth.user.email })
    } else {
      Sentry.setUser(null)
    }
  }, [auth.user?.id])

  return (
    <div className="min-h-screen">
      <FlashMessages />
      <main>{children}</main>
    </div>
  )
}
