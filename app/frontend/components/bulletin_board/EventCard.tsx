import { ModalLink } from '@inertiaui/modal-react'
import clsx from 'clsx'
import { AnimatePresence, motion, useIsPresent, useSpring, type MotionValue } from 'motion/react'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { DateTime } from 'luxon'
import ImagePlaceholder from '@/components/shared/ImagePlaceholder'
import MarqueeText from '@/components/shared/MarqueeText'
import { SlidingNumber } from '@/components/shared/SlidingNumber'
import {
  computeBulletinEventStatus,
  formatEventDateLabel,
  formatEventDuration,
  isEventCrossDay,
  type SerializedBulletinEvent,
} from '@/lib/bulletinEventStatus'
import { useColorLerp } from '@/lib/useColorLerp'
import styles from './EventCard.module.scss'

type Props = {
  event: SerializedBulletinEvent
  now: Date
}

type TimerPieces = { days: number; hours: number; minutes: number; seconds: number }

function breakdown(totalSeconds: number): TimerPieces {
  const s = Math.max(0, Math.floor(totalSeconds))
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  }
}

type TimerConfig = {
  label: string
  seconds?: number
  staticText?: string
  live?: boolean
  happening?: boolean
}

function EventTimer({ config, progress }: { config: TimerConfig; progress?: MotionValue<number> }) {
  const { label, seconds, staticText, live = false, happening = false } = config
  const pieces = seconds != null ? breakdown(seconds) : null

  return (
    <div className={styles.timer}>
      {happening && <div className={styles.timerStripes} aria-hidden />}
      <span className={styles.timerLabel}>
        <AnimatePresence initial={false}>
          {live && (
            <motion.span
              key="dot-wrap"
              aria-hidden
              initial={{ width: '0rem', opacity: 0, marginRight: '0rem', scale: 0 }}
              animate={{ width: '0.5rem', opacity: 1, marginRight: '0.4rem', scale: 1 }}
              exit={{ width: '0rem', opacity: 0, marginRight: '0rem', scale: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32, mass: 0.5 }}
              style={{ display: 'inline-flex', alignItems: 'center', transformOrigin: 'center' }}
            >
              <span className={styles.liveDot} />
            </motion.span>
          )}
        </AnimatePresence>
        <span className={styles.timerLabelText}>{label}</span>
      </span>
      {staticText != null ? (
        <span className={styles.timerStatic}>{staticText}</span>
      ) : pieces ? (
        <div className={styles.timerDigits}>
          <SlidingNumber value={pieces.hours} padStart />
          <span className={styles.timerSep}>:</span>
          <SlidingNumber value={pieces.minutes} padStart />
          <span className={styles.timerSep}>:</span>
          <SlidingNumber value={pieces.seconds} padStart />
        </div>
      ) : null}
      {progress && (
        <div className={styles.progressTrack} aria-hidden>
          <motion.div className={styles.progressFill} style={{ scaleX: progress }} />
        </div>
      )}
    </div>
  )
}

export default function EventCard({ event, now }: Props) {
  const status = computeBulletinEventStatus(event, now)
  const nowDt = DateTime.fromJSDate(now)
  const isPresent = useIsPresent()
  const cardRef = useRef<HTMLDivElement>(null)
  // Captured while the card is a flex item, then pinned via top/left on exit — the
  // flex spec places absolute children at the "sole flex item" static position
  // (slot 0 under justify-content: flex-start), so without this the card jumps left.
  const lastOffsetRef = useRef<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (isPresent && cardRef.current) {
      lastOffsetRef.current = {
        top: cardRef.current.offsetTop,
        left: cardRef.current.offsetLeft,
      }
    }
  })

  let timer: TimerConfig | null = null
  if (status === 'upcoming' && event.starts_at) {
    const startsAt = DateTime.fromISO(event.starts_at)
    const diffHours = startsAt.diff(nowDt, 'hours').hours
    if (diffHours >= 24) {
      const days = Math.max(1, Math.round(startsAt.diff(nowDt, 'days').days))
      timer = { label: 'Starts in', staticText: `${days} ${days === 1 ? 'day' : 'days'}` }
    } else {
      timer = { label: 'Starts in', seconds: Math.max(0, diffHours * 3600) }
    }
  } else if (status === 'happening') {
    if (event.ends_at) {
      const endsAt = DateTime.fromISO(event.ends_at)
      const diffHours = endsAt.diff(nowDt, 'hours').hours
      if (diffHours >= 24) {
        const days = Math.max(1, Math.round(endsAt.diff(nowDt, 'days').days))
        timer = {
          label: 'Ends in',
          staticText: `${days} ${days === 1 ? 'day' : 'days'}`,
          live: true,
          happening: true,
        }
      } else {
        timer = {
          label: 'Ends in',
          seconds: Math.max(0, diffHours * 3600),
          live: true,
          happening: true,
        }
      }
    } else if (event.starts_at) {
      const startsAt = DateTime.fromISO(event.starts_at)
      const elapsedHours = nowDt.diff(startsAt, 'hours').hours
      if (elapsedHours >= 24) {
        const days = Math.max(1, Math.round(nowDt.diff(startsAt, 'days').days))
        timer = {
          label: 'Live for',
          staticText: `${days} ${days === 1 ? 'day' : 'days'}`,
          live: true,
          happening: true,
        }
      } else {
        timer = {
          label: 'Live for',
          seconds: Math.max(0, elapsedHours * 3600),
          live: true,
          happening: true,
        }
      }
    }
  }

  const hasRange = !!(event.starts_at && event.ends_at)
  let whenText = 'Live'
  let detailText: string | null = null
  if (event.starts_at) {
    const start = DateTime.fromISO(event.starts_at)
    if (hasRange) {
      const end = DateTime.fromISO(event.ends_at!)
      const duration = formatEventDuration(event.starts_at, event.ends_at)
      if (isEventCrossDay(event.starts_at, event.ends_at)) {
        const startLabel = `${formatEventDateLabel(event.starts_at, now)}, ${start.toFormat('t')}`
        const endLabel = `${formatEventDateLabel(event.ends_at!, now)}, ${end.toFormat('t')}`
        whenText = `${startLabel} → ${endLabel}`
      } else {
        const dateLabel = formatEventDateLabel(event.starts_at, now)
        whenText = `${dateLabel} · ${start.toFormat('t')} – ${end.toFormat('t')}`
      }
      detailText = duration
    } else {
      whenText = `${formatEventDateLabel(event.starts_at, now)} · ${start.toFormat('t')}`
    }
  }

  const showProgressBar = status === 'happening' && hasRange
  let progressTarget = 0
  if (showProgressBar && event.starts_at && event.ends_at) {
    const startMs = new Date(event.starts_at).getTime()
    const endMs = new Date(event.ends_at).getTime()
    const span = endMs - startMs
    progressTarget = span > 0 ? Math.max(0, Math.min(1, (now.getTime() - startMs) / span)) : 1
  }
  const progressSpring = useSpring(progressTarget, {
    stiffness: 120,
    damping: 24,
    mass: 0.6,
  })
  useEffect(() => {
    progressSpring.set(progressTarget)
  }, [progressTarget, progressSpring])

  const happeningProgress = useSpring(status === 'happening' ? 1 : 0, {
    stiffness: 180,
    damping: 24,
    mass: 0.6,
  })
  useEffect(() => {
    happeningProgress.set(status === 'happening' ? 1 : 0)
  }, [status, happeningProgress])

  const pillBg = useColorLerp(happeningProgress, 'var(--color-light-brown)', 'var(--color-green)')
  const pillColor = useColorLerp(happeningProgress, 'var(--color-dark-brown)', '#e2e2e2')

  const exitStyle =
    !isPresent && lastOffsetRef.current
      ? { top: lastOffsetRef.current.top, left: lastOffsetRef.current.left }
      : undefined

  return (
    <motion.div
      ref={cardRef}
      layout="position"
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.2, ease: 'easeInOut' } }}
      transition={{ type: 'spring', stiffness: 380, damping: 32, mass: 0.5 }}
      data-exiting={isPresent ? undefined : ''}
      data-event-id={event.id}
      style={exitStyle}
      className={styles.cardWrap}
    >
      <ModalLink href={`/bulletin_board/events/${event.id}`} className={styles.card}>
        <MarqueeText text={event.title} className={styles.title} />

        <div className={styles.imageWrap}>
          {event.image_url ? (
            <img src={event.image_url} alt="" className={styles.image} loading="lazy" />
          ) : (
            <ImagePlaceholder text="Event poster coming soon" className={styles.placeholder} />
          )}
        </div>

        <div className={styles.footer}>
          <div className={styles.whenGroup}>
            <MarqueeText text={whenText} className={styles.whenPrimary} />
            {detailText && <span className={styles.whenSecondary}>{detailText}</span>}
          </div>
          <motion.span
            layout
            transition={{ type: 'spring', stiffness: 320, damping: 28, mass: 0.5 }}
            className={clsx(styles.status, status === 'happening' && styles.statusHappening)}
            style={{ backgroundColor: pillBg, color: pillColor }}
          >
            {status === 'happening' ? 'Happening now' : 'Upcoming'}
          </motion.span>
        </div>

        {timer && <EventTimer config={timer} progress={showProgressBar ? progressSpring : undefined} />}
      </ModalLink>
    </motion.div>
  )
}
