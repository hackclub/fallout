export type NotificationType = 'alert' | 'notice'

export type NotificationPayload = {
  id: string
  type: NotificationType
  message: string
}

type Listener = (n: NotificationPayload) => void

const listeners = new Set<Listener>()
let counter = 0

export function notify(type: NotificationType, message: string) {
  const id = `notification-${counter++}`
  listeners.forEach(l => l({ id, type, message }))
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
