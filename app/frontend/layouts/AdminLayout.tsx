import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { usePage } from '@inertiajs/react'
import * as Sentry from '@sentry/react'
import FlashMessages from '@/components/FlashMessages'
import AdminSidebar from '@/components/admin/AdminSidebar'
import type { SharedProps } from '@/types'
import '@/styles/admin.css'

export default function AdminLayout({ children, flush }: { children: ReactNode; flush?: boolean }) {
  const { auth } = usePage<SharedProps>().props

  useEffect(() => {
    document.title = 'Fallout Admin'
  }, [])

  useEffect(() => {
    if (auth.user) {
      Sentry.setUser({ id: String(auth.user.id), email: auth.user.email })
    } else {
      Sentry.setUser(null)
    }
  }, [auth.user?.id])

  return (
    <div className="admin bg-background text-foreground min-h-screen flex">
      <AdminSidebar />

      <div className="flex-1 min-w-0">
        <FlashMessages />
        <main className={flush ? undefined : 'p-6'}>{children}</main>
      </div>
    </div>
  )
}
