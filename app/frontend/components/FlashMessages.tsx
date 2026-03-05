import { usePage } from '@inertiajs/react'
import { useState, useEffect, useRef } from 'react'
import type { SharedProps } from '@/types'
import { subscribe, notify, type NotificationPayload } from '@/lib/notifications'

type Notification = NotificationPayload & { phase: 'in' | 'visible' | 'out' }

const VISIBLE_MS = 4000
const EXIT_MS = 300

export default function FlashMessages() {
  const { flash } = usePage<SharedProps>().props
  const [notifications, setNotifications] = useState<Notification[]>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>[]>>(new Map())

  function dismiss(id: string) {
    // Clear any pending auto-dismiss timers
    timers.current.get(id)?.forEach(clearTimeout)
    timers.current.delete(id)

    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, phase: 'out' } : n)))
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id))
    }, EXIT_MS)
  }

  function add(payload: NotificationPayload) {
    setNotifications((prev) => [...prev, { ...payload, phase: 'in' }])

    const t1 = setTimeout(() => {
      setNotifications((prev) => prev.map((n) => (n.id === payload.id ? { ...n, phase: 'visible' } : n)))
    }, 10)

    const t2 = setTimeout(() => {
      dismiss(payload.id)
    }, VISIBLE_MS)

    timers.current.set(payload.id, [t1, t2])
  }

  useEffect(() => {
    const unsub = subscribe(add)
    if (flash.alert) notify('alert', flash.alert)
    if (flash.notice) notify('notice', flash.notice)
    return unsub
  }, [])

  if (notifications.length === 0) return null

  return (
    <div className="fixed top-6 inset-x-0 flex flex-col items-center gap-2 z-50 pointer-events-none">
      {notifications.map((n) => (
        <div
          key={n.id}
          className={[
            'pointer-events-auto flex items-start justify-between gap-3 px-5 py-3',
            'border-2 border-dark-brown font-medium text-dark-brown',
            'transition-all duration-300 ease-out max-w-sm w-full shadow-sm',
            n.type === 'alert' ? 'bg-red-200' : 'bg-light-green',
            n.phase !== 'visible' ? 'opacity-0 -translate-y-2' : 'opacity-100 translate-y-0',
          ].join(' ')}
        >
          <span>{n.message}</span>
          <button
            onClick={() => dismiss(n.id)}
            className="shrink-0 opacity-60 hover:opacity-100 cursor-pointer leading-none"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
