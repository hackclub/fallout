export type NotificationType = 'alert' | 'notice'

export type NotificationPayload = {
  id: string
  type: NotificationType
  message: string
}

type Listener = (n: NotificationPayload) => void

const listeners = new Set<Listener>()
const pending: NotificationPayload[] = []
let counter = 0

export function notify(type: NotificationType, message: string) {
  const payload: NotificationPayload = { id: `notification-${counter++}`, type, message }
  if (listeners.size === 0) {
    pending.push(payload)
  } else {
    listeners.forEach((l) => l(payload))
  }
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn)
  pending.splice(0).forEach((p) => fn(p))
  return () => listeners.delete(fn)
}

// Shown when the :disable_new_submissions kill switch blocks creating a project or a first submission.
export const SUBMISSIONS_CLOSED_MESSAGE = 'Fallout has ended and submissions have closed, thanks for participating!'

// Shown when the :disable_shop_orders kill switch blocks buying a shop item.
export const SHOP_ORDERS_CLOSED_MESSAGE =
  'The shop is closed for new orders right now. Your existing orders are not affected.'

// Why the Submit button is unavailable, keyed by ProjectPolicy#ship_block_reason.
export const SHIP_BLOCK_MESSAGES: Record<string, string> = {
  submissions_closed: SUBMISSIONS_CLOSED_MESSAGE,
  final_review_used:
    "You've already had your final review, so this project can no longer be submitted. Thanks for participating!",
  deadline_passed:
    'The 3-day window to resubmit this project has closed, so it can no longer be submitted. Thanks for participating!',
}
