import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { router, usePage } from '@inertiajs/react'
import * as Sentry from '@sentry/react'
import FlashMessages from '@/components/FlashMessages'
import AdminSidebar from '@/components/admin/AdminSidebar'
import AdminCommandPalette from '@/components/admin/AdminCommandPalette'
import { navIndex } from '@/components/admin/adminNavOrder'
import type { SharedProps } from '@/types'
import '@/styles/admin.css'

const SLIDE_DUR = 300
const SLIDE_EASE = 'cubic-bezier(0.075, 0.82, 0.165, 1)'
const SLIDE_DISTANCE = 24

export default function AdminLayout({ children, flush }: { children: ReactNode; flush?: boolean }) {
  const { auth } = usePage<SharedProps>().props
  const url = usePage().url
  const pathname = url.split('?')[0]

  const mainRef = useRef<HTMLMainElement>(null)
  // Direction is set in router.on('before') and read after React re-renders
  const pendingDir = useRef<'up' | 'down' | null>(null)

  useEffect(() => {
    document.title = 'Fallout Admin'
  }, [])

  useEffect(() => {
    if (auth.user) {
      Sentry.setUser({ id: String(auth.user.id) })
    } else {
      Sentry.setUser(null)
    }
  }, [auth.user?.id])

  // Register the before-navigate handler once — captures ghost + direction
  useEffect(() => {
    const off = router.on('before', (event) => {
      const dest = event.detail.visit.url.pathname
      const fromIdx = navIndex(window.location.pathname)
      const toIdx = navIndex(dest)
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) {
        pendingDir.current = null
        return
      }
      const dir: 'up' | 'down' = toIdx > fromIdx ? 'up' : 'down'
      pendingDir.current = dir

      const main = mainRef.current
      if (!main) return

      // Remove any leftover ghost from a previous navigation
      document.getElementById('admin-page-ghost')?.remove()

      // Snapshot exiting page into a fixed ghost overlay
      const ghost = document.createElement('div')
      ghost.id = 'admin-page-ghost'
      ghost.setAttribute('aria-hidden', 'true')
      const rect = main.getBoundingClientRect()
      const cs = getComputedStyle(main)
      ghost.style.cssText = `
        position: fixed;
        top: ${rect.top}px;
        left: ${rect.left}px;
        width: ${rect.width}px;
        height: ${rect.height}px;
        padding: ${cs.padding};
        box-sizing: border-box;
        overflow: hidden;
        pointer-events: none;
        z-index: 39;
        background: var(--background, #fff);
        will-change: transform, opacity;
      `
      ghost.innerHTML = main.innerHTML
      document.body.appendChild(ghost)

      // Hide live <main> — ghost covers it until new content is ready
      main.style.transition = 'none'
      main.style.opacity = '0'
      main.style.transform = 'translateY(0)'
    })
    return off
  }, [])

  // This effect runs after React has committed the new page to the DOM.
  // Trigger simultaneous ghost-exit + new-page-enter here.
  useEffect(() => {
    const dir = pendingDir.current
    if (!dir) return
    pendingDir.current = null

    const main = mainRef.current
    if (!main) return

    const ghost = document.getElementById('admin-page-ghost')
    const exitY = dir === 'up' ? -SLIDE_DISTANCE : SLIDE_DISTANCE
    const enterFromY = dir === 'up' ? SLIDE_DISTANCE : -SLIDE_DISTANCE

    // Position new page at enter-start (no transition) before paint
    main.style.transition = 'none'
    main.style.transform = `translateY(${enterFromY}px)`
    main.style.opacity = '0'

    // Both animations start on the same frame — truly simultaneous
    requestAnimationFrame(() => {
      if (ghost) {
        ghost.style.transition = `transform ${SLIDE_DUR}ms ${SLIDE_EASE}, opacity ${SLIDE_DUR}ms ${SLIDE_EASE}`
        ghost.style.transform = `translateY(${exitY}px)`
        ghost.style.opacity = '0'
        setTimeout(() => ghost.remove(), SLIDE_DUR + 50)
      }
      main.style.transition = `transform ${SLIDE_DUR}ms ${SLIDE_EASE}, opacity ${SLIDE_DUR}ms ${SLIDE_EASE}`
      main.style.transform = 'translateY(0)'
      main.style.opacity = '1'
    })
  }, [pathname])

  return (
    <div className="admin bg-background text-foreground min-h-screen">
      <AdminSidebar />
      <AdminCommandPalette />

      <div className="pt-10 sm:pt-0 sm:pl-12">
        <FlashMessages />
        <main ref={mainRef} className={`t-admin-page ${flush ? '' : 'p-6'}`.trim()}>
          {children}
        </main>
      </div>
    </div>
  )
}
