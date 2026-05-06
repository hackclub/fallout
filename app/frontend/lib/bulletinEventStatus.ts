import { DateTime } from 'luxon'

export type BulletinEventStatus = 'draft' | 'upcoming' | 'happening' | 'expired'

export type SerializedBulletinEvent = {
  id: number
  title: string
  description: string
  image_url: string | null
  schedulable: boolean
  starts_at: string | null
  ends_at: string | null
  status: BulletinEventStatus
}

export function computeBulletinEventStatus(
  event: SerializedBulletinEvent,
  now: Date = new Date(),
): BulletinEventStatus {
  // Manual events are toggled by explicit admin Start now / End now actions —
  // their state is fully determined by persisted columns, not the wall clock.
  // Comparing ends_at to a client-side `now` would mis-classify a freshly-ended
  // event as "happening" whenever the client clock hasn't ticked past the
  // server's commit time yet.
  if (!event.schedulable) {
    if (event.ends_at) return 'expired'
    if (!event.starts_at) return 'draft'
    return 'happening'
  }

  // Scheduled events transition passively as the clock advances.
  if (event.ends_at && new Date(event.ends_at) <= now) return 'expired'
  if (!event.starts_at) return 'draft'

  // Minute precision avoids flashing "Upcoming" for an event that just started.
  const startsAtMin = Math.floor(new Date(event.starts_at).getTime() / 60_000)
  const nowMin = Math.floor(now.getTime() / 60_000)
  if (startsAtMin > nowMin) return 'upcoming'

  return 'happening'
}

export function formatEventDateTime(iso: string | null): string {
  if (!iso) return ''
  const dt = DateTime.fromISO(iso)
  return dt.isValid ? dt.toFormat("ccc, LLLL d 'at' t") : ''
}

function ordinal(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  const mod10 = n % 10
  if (mod10 === 1) return `${n}st`
  if (mod10 === 2) return `${n}nd`
  if (mod10 === 3) return `${n}rd`
  return `${n}th`
}

function monthOrdinal(dt: DateTime, referenceYear: number): string {
  const base = `${dt.toFormat('LLL')} ${ordinal(dt.day)}`
  return dt.year === referenceYear ? base : `${base}, ${dt.year}`
}

export function formatEventDateLabel(iso: string | null, now: Date = new Date()): string {
  if (!iso) return ''
  const dt = DateTime.fromISO(iso)
  if (!dt.isValid) return ''
  const nowDt = DateTime.fromJSDate(now)
  const diffDays = Math.round(dt.startOf('day').diff(nowDt.startOf('day'), 'days').days)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays === -1) return 'Yesterday'
  if (diffDays >= 2 && diffDays <= 6) return dt.toFormat('cccc')
  if (diffDays >= 7 && diffDays <= 13) return `Next ${dt.toFormat('cccc')}`
  if (diffDays <= -2 && diffDays >= -6) return `Last ${dt.toFormat('cccc')}`
  return monthOrdinal(dt, nowDt.year)
}

export function formatEventDateRangeLabel(startIso: string, endIso: string, now: Date = new Date()): string {
  const start = DateTime.fromISO(startIso)
  const end = DateTime.fromISO(endIso)
  if (!start.isValid || !end.isValid) return ''
  const currentYear = DateTime.fromJSDate(now).year
  if (start.hasSame(end, 'month') && start.year === end.year) {
    const month = start.toFormat('LLL')
    const suffix = start.year === currentYear ? '' : `, ${start.year}`
    return `${month} ${ordinal(start.day)} – ${ordinal(end.day)}${suffix}`
  }
  return `${monthOrdinal(start, currentYear)} – ${monthOrdinal(end, currentYear)}`
}

export function formatEventTimeRange(startIso: string | null, endIso: string | null, now: Date = new Date()): string {
  if (!startIso) return ''
  const start = DateTime.fromISO(startIso)
  if (!start.isValid) return ''
  if (!endIso) return start.toFormat('t')
  const end = DateTime.fromISO(endIso)
  if (!end.isValid) return start.toFormat('t')
  if (start.hasSame(end, 'day')) {
    return `${start.toFormat('t')} – ${end.toFormat('t')}`
  }
  const currentYear = DateTime.fromJSDate(now).year
  const fmt = (d: DateTime) => `${monthOrdinal(d, currentYear)}, ${d.toFormat('t')}`
  return `${fmt(start)} → ${fmt(end)}`
}

export function formatEventDuration(startIso: string | null, endIso: string | null): string | null {
  if (!startIso || !endIso) return null
  const start = DateTime.fromISO(startIso)
  const end = DateTime.fromISO(endIso)
  if (!start.isValid || !end.isValid) return null
  const totalMinutes = Math.max(0, Math.round(end.diff(start, 'minutes').minutes))
  if (totalMinutes < 60) return `${totalMinutes} min`
  if (totalMinutes < 1440) {
    const h = Math.floor(totalMinutes / 60)
    const m = totalMinutes % 60
    return m === 0 ? `${h} hr` : `${h} hr ${m} min`
  }
  const days = Math.floor(totalMinutes / 1440)
  const remainder = totalMinutes - days * 1440
  const h = Math.floor(remainder / 60)
  const dayPart = days === 1 ? '1 day' : `${days} days`
  return h === 0 ? dayPart : `${dayPart} ${h} hr`
}

export function isEventCrossDay(startIso: string | null, endIso: string | null): boolean {
  if (!startIso || !endIso) return false
  const start = DateTime.fromISO(startIso)
  const end = DateTime.fromISO(endIso)
  if (!start.isValid || !end.isValid) return false
  return !start.hasSame(end, 'day')
}
