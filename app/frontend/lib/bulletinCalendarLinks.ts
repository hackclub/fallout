import { DateTime } from 'luxon'
import type { SerializedBulletinEvent } from '@/lib/bulletinEventStatus'

function toIcsUtc(iso: string): string {
  return DateTime.fromISO(iso).toUTC().toFormat("yyyyLLdd'T'HHmmss'Z'")
}

// Google's TEMPLATE link requires a `dates` parameter even for events without an explicit end.
// We fall back to a 1-hour window starting at `starts_at` so the entry doesn't import as all-day.
function googleDates(event: SerializedBulletinEvent): string | null {
  if (!event.starts_at) return null
  const start = toIcsUtc(event.starts_at)
  const end = event.ends_at
    ? toIcsUtc(event.ends_at)
    : DateTime.fromISO(event.starts_at).toUTC().plus({ hours: 1 }).toFormat("yyyyLLdd'T'HHmmss'Z'")
  return `${start}/${end}`
}

export function googleCalendarUrl(event: SerializedBulletinEvent): string | null {
  const dates = googleDates(event)
  if (!dates) return null
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates,
  })
  if (event.description) params.set('details', event.description)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

export function outlookCalendarUrl(event: SerializedBulletinEvent): string | null {
  if (!event.starts_at) return null
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: event.title,
    startdt: event.starts_at,
  })
  if (event.ends_at) params.set('enddt', event.ends_at)
  if (event.description) params.set('body', event.description)
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`
}

export function icsDownloadUrl(eventId: number): string {
  return `/bulletin_board/events/${eventId}.ics`
}

export function feedPath(): string {
  return '/bulletin_board/events.ics'
}

export type SubscriptionUrls = {
  https: string
  webcal: string
  googleAdd: string
  outlookAdd: string
}

export function subscriptionUrls(origin: string): SubscriptionUrls {
  const path = feedPath()
  const httpsUrl = `${origin}${path}`
  const webcalUrl = httpsUrl.replace(/^https?:/, 'webcal:')
  return {
    https: httpsUrl,
    webcal: webcalUrl,
    googleAdd: `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(webcalUrl)}`,
    outlookAdd: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(httpsUrl)}&name=${encodeURIComponent('Fallout Events')}`,
  }
}
