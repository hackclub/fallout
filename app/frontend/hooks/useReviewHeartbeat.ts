import { useEffect, useRef, useCallback } from 'react'
import { notify } from '@/lib/notifications'

const HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000 // 2 minutes
const MAX_CONSECUTIVE_FAILURES = 2

function csrfToken(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content || ''
}

/**
 * Sends periodic heartbeats to keep a review claim alive.
 * Alerts the reviewer if the claim is lost (409) or connection drops.
 */
export function useReviewHeartbeat(heartbeatPath: string) {
  const failCount = useRef(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  const beat = useCallback(async () => {
    try {
      const res = await fetch(heartbeatPath, {
        method: 'POST',
        headers: {
          'X-CSRF-Token': csrfToken(),
          Accept: 'application/json',
        },
      })
      if (res.ok) {
        failCount.current = 0
      } else if (res.status === 409) {
        clearInterval(intervalRef.current)
        notify('alert', 'Your review session has expired. Another reviewer may have claimed this review.')
      } else {
        failCount.current++
      }
    } catch {
      failCount.current++
    }

    if (failCount.current >= MAX_CONSECUTIVE_FAILURES) {
      notify('alert', 'Connection lost. Your review session may have expired.')
      clearInterval(intervalRef.current)
    }
  }, [heartbeatPath])

  useEffect(() => {
    intervalRef.current = setInterval(beat, HEARTBEAT_INTERVAL_MS)
    return () => clearInterval(intervalRef.current)
  }, [beat])
}
