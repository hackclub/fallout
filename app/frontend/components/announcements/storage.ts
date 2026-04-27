const STORAGE_PREFIX = 'fallout:announcement-dismissed:'
const LEGACY_FEEDBACK_KEY = 'feedback_banner_dismissed' // pre-refactor key — read once for migration
const FEEDBACK_ID = 'feedback:fallout-form'

const listeners = new Map<string, Set<(dismissed: boolean) => void>>()

export function isAnnouncementDismissed(id: string): boolean {
  if (typeof window === 'undefined') return false
  if (id === FEEDBACK_ID && localStorage.getItem(LEGACY_FEEDBACK_KEY) === 'true') return true
  return localStorage.getItem(STORAGE_PREFIX + id) === 'true'
}

export function dismissAnnouncement(id: string) {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_PREFIX + id, 'true')
  listeners.get(id)?.forEach((cb) => cb(true))
}

export function subscribeToDismissals(id: string, cb: (dismissed: boolean) => void): () => void {
  if (!listeners.has(id)) listeners.set(id, new Set())
  listeners.get(id)!.add(cb)
  return () => listeners.get(id)?.delete(cb)
}

export const FEEDBACK_ANNOUNCEMENT_ID = FEEDBACK_ID
