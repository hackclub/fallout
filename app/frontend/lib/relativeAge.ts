import { DateTime } from 'luxon'

export type RelativeAgeParts = { kind: 'now'; label: string } | { kind: 'relative'; value: number; unit: string }

// Breaks a past ISO timestamp into structured parts so callers can render the
// numeric portion with SlidingNumber (changes often) and the unit/label with
// TextMorph (changes rarely) instead of morphing the whole string.
export function relativeAgeParts(iso: string | null | undefined, now: Date): RelativeAgeParts | null {
  if (!iso) return null

  const dt = DateTime.fromISO(iso).toLocal()
  if (!dt.isValid) return null

  const nowDt = DateTime.fromJSDate(now).toLocal()
  const seconds = nowDt.diff(dt, 'seconds').seconds

  if (seconds < 60) return { kind: 'now', label: 'just now' }
  if (seconds < 3_600) {
    const value = Math.max(1, Math.floor(seconds / 60))
    return { kind: 'relative', value, unit: value === 1 ? 'minute' : 'minutes' }
  }
  if (seconds < 86_400) {
    const value = Math.max(1, Math.floor(seconds / 3_600))
    return { kind: 'relative', value, unit: value === 1 ? 'hour' : 'hours' }
  }
  if (seconds < 2_592_000) {
    const value = Math.max(1, Math.floor(seconds / 86_400))
    return { kind: 'relative', value, unit: value === 1 ? 'day' : 'days' }
  }

  const months = Math.max(1, Math.floor(nowDt.diff(dt, 'months').months))
  if (months < 12) return { kind: 'relative', value: months, unit: months === 1 ? 'month' : 'months' }

  const years = Math.max(1, Math.floor(nowDt.diff(dt, 'years').years))
  return { kind: 'relative', value: years, unit: years === 1 ? 'year' : 'years' }
}

export function formatRelativeAgeLabel(parts: RelativeAgeParts | null, prefix: string, fallback: string): string {
  if (!parts) return fallback
  if (parts.kind === 'now') return `${prefix}${parts.label}`
  return `${prefix}${parts.value} ${parts.unit} ago`
}
