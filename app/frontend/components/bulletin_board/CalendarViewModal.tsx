import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ModalLink, useModalStack } from '@inertiaui/modal-react'
import { motion } from 'motion/react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import clsx from 'clsx'
import { DateTime, Interval } from 'luxon'
import { computeBulletinEventStatus, type SerializedBulletinEvent } from '@/lib/bulletinEventStatus'
import { useNowTick } from '@/lib/useNowTick'
import styles from './CalendarViewModal.module.scss'

type Props = {
  events: SerializedBulletinEvent[]
  onClose: () => void
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MAX_VISIBLE_EVENTS_PER_DAY = 2

type DayCell = {
  iso: string
  date: DateTime
  inCurrentMonth: boolean
  events: SerializedBulletinEvent[]
}

function buildMonthGrid(monthAnchor: DateTime, events: SerializedBulletinEvent[]): DayCell[] {
  const monthStart = monthAnchor.startOf('month')
  const monthEnd = monthAnchor.endOf('month')
  // Always start the grid on Sunday and end on Saturday to keep the 7-column layout intact.
  const gridStart = monthStart.minus({ days: monthStart.weekday % 7 })
  const gridEnd = monthEnd.plus({ days: 6 - (monthEnd.weekday % 7) })

  const cells: DayCell[] = []
  let cursor = gridStart
  while (cursor <= gridEnd) {
    const dayStart = cursor.startOf('day')
    const dayEnd = cursor.endOf('day')
    const dayInterval = Interval.fromDateTimes(dayStart, dayEnd)

    const cellEvents = events.filter((event) => {
      if (!event.starts_at) return false
      const start = DateTime.fromISO(event.starts_at)
      if (!start.isValid) return false
      if (!event.ends_at) return start.hasSame(cursor, 'day')
      const end = DateTime.fromISO(event.ends_at)
      if (!end.isValid) return false
      const eventInterval = Interval.fromDateTimes(start, end < start ? start : end)
      return eventInterval.overlaps(dayInterval)
    })

    cells.push({
      iso: cursor.toISODate() ?? '',
      date: cursor,
      inCurrentMonth: cursor.month === monthAnchor.month && cursor.year === monthAnchor.year,
      events: cellEvents,
    })
    cursor = cursor.plus({ days: 1 })
  }
  return cells
}

export default function CalendarViewModal({ events, onClose }: Props) {
  const now = useNowTick(60_000)
  const today = DateTime.fromJSDate(now)
  const [monthAnchor, setMonthAnchor] = useState(today.startOf('month'))
  const [expandedDayIso, setExpandedDayIso] = useState<string | null>(null)
  // Snapshot the Inertia modal stack at mount so we can detect when something (typically the
  // event detail) has been pushed on top of this overlay. If the stack grew, Esc should fall
  // through to that newer modal instead of closing the calendar from underneath it.
  const { stack } = useModalStack()
  const stackBaseRef = useRef<number>(stack.length)
  useEffect(() => {
    stackBaseRef.current = stack.length
    // Capture once on mount — runtime growth is exactly what we want to detect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // Capture-phase + stopPropagation: the bulletin board itself can render inside an Inertia
    // Modal whose own keydown handler also closes on Esc. Without this, hitting Esc would
    // dismiss the bulletin board page instead of just this overlay.
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Defer to the Inertia modal stack when something has opened on top of us.
      if (stack.length > stackBaseRef.current) return
      e.stopPropagation()
      if (expandedDayIso) {
        setExpandedDayIso(null)
      } else {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKey, true)
    return () => window.removeEventListener('keydown', handleKey, true)
  }, [expandedDayIso, onClose, stack.length])

  const grid = useMemo(() => buildMonthGrid(monthAnchor, events), [monthAnchor, events])
  const onCurrentMonth = monthAnchor.hasSame(today, 'month') && monthAnchor.hasSame(today, 'year')
  // Bottom row of the 7-column grid — the last 7 cells. We render the day-overflow detail
  // upward on these so it doesn't clip below the modal body's scroll area.
  const bottomRowStart = grid.length - 7

  const renderEventChip = (event: SerializedBulletinEvent) => {
    const status = computeBulletinEventStatus(event, now)
    // Intentionally NOT closing the calendar on click — the event detail modal opens on top
    // (its CSS z-index is bumped above this overlay in application.css). When the user closes
    // the detail, they land back in the calendar where they left off.
    return (
      <ModalLink
        key={event.id}
        href={`/bulletin_board/events/${event.id}`}
        className={clsx(
          styles.eventChip,
          status === 'happening' && styles.eventChipHappening,
          status === 'expired' && styles.eventChipExpired,
        )}
      >
        <span className={styles.eventChipLabel}>{event.title}</span>
      </ModalLink>
    )
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <motion.div
      key="calendar-backdrop"
      className={styles.backdrop}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Bulletin board calendar"
    >
      <motion.div
        key="calendar-panel"
        className={styles.panel}
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28, mass: 0.6 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <button
              type="button"
              aria-label="Previous month"
              className={styles.iconButton}
              onClick={() => {
                setMonthAnchor((anchor) => anchor.minus({ months: 1 }))
                setExpandedDayIso(null)
              }}
            >
              <ChevronLeft className={styles.iconButtonIcon} aria-hidden />
            </button>
            <h2 className={styles.title}>
              <span className={styles.monthLabel}>{monthAnchor.toFormat('LLLL yyyy')}</span>
              {!onCurrentMonth && <span className={styles.todayHint}>Today: {today.toFormat('LLL d')}</span>}
            </h2>
            <button
              type="button"
              aria-label="Next month"
              className={styles.iconButton}
              onClick={() => {
                setMonthAnchor((anchor) => anchor.plus({ months: 1 }))
                setExpandedDayIso(null)
              }}
            >
              <ChevronRight className={styles.iconButtonIcon} aria-hidden />
            </button>
          </div>
          <div className={styles.headerLegend} aria-hidden>
            <span className={styles.legendDot}>
              <span className={clsx(styles.legendSwatch, styles.legendSwatchUpcoming)} />
              Upcoming
            </span>
            <span className={styles.legendDot}>
              <span className={clsx(styles.legendSwatch, styles.legendSwatchHappening)} />
              Happening
            </span>
            <span className={styles.legendDot}>
              <span className={clsx(styles.legendSwatch, styles.legendSwatchExpired)} />
              Ended
            </span>
          </div>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.todayButton}
              disabled={onCurrentMonth}
              onClick={() => {
                setMonthAnchor(today.startOf('month'))
                setExpandedDayIso(null)
              }}
            >
              Today
            </button>
            <button type="button" aria-label="Close calendar" className={styles.iconButton} onClick={onClose}>
              <X className={styles.iconButtonIcon} aria-hidden />
            </button>
          </div>
        </div>

        <div className={styles.body}>
          <div className={styles.weekRow}>
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className={styles.weekCell}>
                {label}
              </div>
            ))}
          </div>

          <div className={styles.grid}>
            {grid.map((cell, index) => {
              const isToday = cell.date.hasSame(today, 'day')
              const visible = cell.events.slice(0, MAX_VISIBLE_EVENTS_PER_DAY)
              const overflow = cell.events.length - visible.length
              const expanded = expandedDayIso === cell.iso
              const openUpward = index >= bottomRowStart

              return (
                <div
                  key={cell.iso}
                  className={clsx(styles.day, !cell.inCurrentMonth && styles.dayOutside, isToday && styles.dayToday)}
                >
                  <span className={styles.dayNumber}>
                    <span className={isToday ? styles.dayTodayNumber : undefined}>{cell.date.day}</span>
                  </span>
                  <div className={styles.eventList}>
                    {visible.map(renderEventChip)}
                    {overflow > 0 && (
                      <button
                        type="button"
                        className={styles.moreLink}
                        onClick={() => setExpandedDayIso(expanded ? null : cell.iso)}
                        aria-expanded={expanded}
                      >
                        +{overflow} more
                      </button>
                    )}
                  </div>
                  {expanded && cell.events.length > MAX_VISIBLE_EVENTS_PER_DAY && (
                    <div className={clsx(styles.dayDetail, openUpward && styles.dayDetailUp)}>
                      <div className={styles.dayDetailHeader}>{cell.date.toFormat('cccc, LLL d')}</div>
                      {cell.events.map(renderEventChip)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  )
}
