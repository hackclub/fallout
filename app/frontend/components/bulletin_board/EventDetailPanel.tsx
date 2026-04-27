import clsx from 'clsx'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { animate, AnimatePresence, motion, useSpring, type MotionValue } from 'motion/react'
import { ArrowLeftIcon } from '@heroicons/react/20/solid'
import { CalendarDaysIcon, ClockIcon, PhotoIcon } from '@heroicons/react/24/outline'
import { DateTime } from 'luxon'
import Frame from '@/components/shared/Frame'
import { SlidingNumber } from '@/components/shared/SlidingNumber'
import TextMorph from '@/components/shared/TextMorph'
import {
  computeBulletinEventStatus,
  formatEventDateLabel,
  formatEventDateTime,
  formatEventDuration,
  formatEventTimeRange,
  isEventCrossDay,
  type BulletinEventStatus,
  type SerializedBulletinEvent,
} from '@/lib/bulletinEventStatus'
import { useColorLerp } from '@/lib/useColorLerp'
import { useNowTick } from '@/lib/useNowTick'
import styles from './EventDetailPanel.module.scss'

type Props = {
  event: SerializedBulletinEvent
  onBack: () => void
}

const STATUS_LABEL: Record<BulletinEventStatus, string> = {
  draft: 'Draft',
  upcoming: 'Upcoming',
  happening: 'Happening now',
  expired: 'Ended',
}

type Pieces = { days: number; hours: number; minutes: number; seconds: number }

function breakdown(totalSeconds: number): Pieces {
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
  progress?: MotionValue<number>
}

function BigTimer({ config }: { config: TimerConfig }) {
  const { label, seconds, staticText, live = false, happening = false, progress } = config
  const pieces = seconds != null ? breakdown(seconds) : null

  return (
    <motion.div
      layout="position"
      transition={{ type: 'spring', stiffness: 320, damping: 28, mass: 0.5 }}
      className={clsx(styles.timer, happening && styles.timerHappening)}
    >
      {happening && <div className={styles.timerStripes} aria-hidden />}

      <span className={styles.timerLabel}>
        <AnimatePresence initial={false}>
          {live && (
            <motion.span
              key="dot-wrap"
              aria-hidden
              initial={{ width: '0rem', opacity: 0, marginRight: '0rem', scale: 0 }}
              animate={{ width: '0.55rem', opacity: 1, marginRight: '0.5rem', scale: 1 }}
              exit={{ width: '0rem', opacity: 0, marginRight: '0rem', scale: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32, mass: 0.5 }}
              className={styles.liveDotWrap}
            >
              <span className={styles.liveDot} />
            </motion.span>
          )}
        </AnimatePresence>
        <TextMorph as="span" className={styles.timerLabelText}>
          {label}
        </TextMorph>
      </span>

      {staticText != null ? (
        <span className={styles.timerStatic}>{staticText}</span>
      ) : pieces ? (
        <div className={styles.timerDigits}>
          {pieces.days > 0 && (
            <>
              <span className={styles.timerUnit}>
                <SlidingNumber value={pieces.days} />
                <span className={styles.timerUnitLabel}>d</span>
              </span>
              <span className={styles.timerSep}>:</span>
            </>
          )}
          <span className={styles.timerUnit}>
            <SlidingNumber value={pieces.hours} padStart />
            <span className={styles.timerUnitLabel}>h</span>
          </span>
          <span className={styles.timerSep}>:</span>
          <span className={styles.timerUnit}>
            <SlidingNumber value={pieces.minutes} padStart />
            <span className={styles.timerUnitLabel}>m</span>
          </span>
          <span className={styles.timerSep}>:</span>
          <span className={styles.timerUnit}>
            <SlidingNumber value={pieces.seconds} padStart />
            <span className={styles.timerUnitLabel}>s</span>
          </span>
        </div>
      ) : null}

      {progress && (
        <div className={styles.progressTrack} aria-hidden>
          <motion.div className={styles.progressFill} style={{ scaleX: progress }} />
        </div>
      )}
    </motion.div>
  )
}

function buildTimer(event: SerializedBulletinEvent, now: Date): TimerConfig | null {
  const status = computeBulletinEventStatus(event, now)
  const nowDt = DateTime.fromJSDate(now)

  if (status === 'upcoming' && event.starts_at) {
    const startsAt = DateTime.fromISO(event.starts_at)
    const diffHours = startsAt.diff(nowDt, 'hours').hours
    if (diffHours >= 48) {
      const days = Math.max(1, Math.round(startsAt.diff(nowDt, 'days').days))
      return { label: 'Starts in', staticText: `${days} ${days === 1 ? 'day' : 'days'}` }
    }
    return { label: 'Starts in', seconds: Math.max(0, diffHours * 3600) }
  }

  if (status === 'happening') {
    if (event.ends_at) {
      const endsAt = DateTime.fromISO(event.ends_at)
      const diffHours = endsAt.diff(nowDt, 'hours').hours
      if (diffHours >= 48) {
        const days = Math.max(1, Math.round(endsAt.diff(nowDt, 'days').days))
        return {
          label: 'Ends in',
          staticText: `${days} ${days === 1 ? 'day' : 'days'}`,
          live: true,
          happening: true,
        }
      }
      return {
        label: 'Ends in',
        seconds: Math.max(0, diffHours * 3600),
        live: true,
        happening: true,
      }
    }
    if (event.starts_at) {
      const startsAt = DateTime.fromISO(event.starts_at)
      const elapsedHours = nowDt.diff(startsAt, 'hours').hours
      if (elapsedHours >= 48) {
        const days = Math.max(1, Math.round(nowDt.diff(startsAt, 'days').days))
        return {
          label: 'Live for',
          staticText: `${days} ${days === 1 ? 'day' : 'days'}`,
          live: true,
          happening: true,
        }
      }
      return {
        label: 'Live for',
        seconds: Math.max(0, elapsedHours * 3600),
        live: true,
        happening: true,
      }
    }
  }

  return null
}

function DescriptionBlock({ description }: { description: string }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const scrollParentRef = useRef<HTMLElement | null>(null)
  // Live offset between scrollTop and the body bottom across a height animation.
  // Constant for collapse (preserves the user's relative view); tweened to 0
  // for expand-from-near-bottom so the new content lands fully at the bottom.
  const stickyOffsetRef = useRef<number | null>(null)
  const offsetAnimationRef = useRef<{ stop: () => void } | null>(null)
  const [clampedHeight, setClampedHeight] = useState<number | null>(null)
  const [overflows, setOverflows] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    let p: HTMLElement | null = el.parentElement
    while (p) {
      const o = getComputedStyle(p).overflowY
      if (o === 'auto' || o === 'scroll') {
        scrollParentRef.current = p
        break
      }
      p = p.parentElement
    }

    const measure = () => {
      const lh = parseFloat(getComputedStyle(el).lineHeight) || 0
      const ch = lh * 4
      setClampedHeight(ch)
      setOverflows(el.scrollHeight > ch + 1)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [description])

  const collapsed = !expanded && overflows && clampedHeight != null

  const handleToggle = () => {
    if (offsetAnimationRef.current) {
      offsetAnimationRef.current.stop()
      offsetAnimationRef.current = null
    }

    const el = scrollParentRef.current
    if (!el) {
      stickyOffsetRef.current = null
      setExpanded((e) => !e)
      return
    }

    const dist = Math.max(0, el.scrollHeight - el.scrollTop - el.clientHeight)

    if (dist > 64) {
      // Mid-body reader — leave their scroll position alone.
      stickyOffsetRef.current = null
    } else {
      stickyOffsetRef.current = dist
      if (!expanded && dist > 0) {
        // Expanding while the toggle button is only partially in view: tween
        // the offset from `dist` to 0 alongside the height spring (same params
        // → same curve). scrollTop = scrollHeight - clientHeight - offset
        // therefore evaluates to oldScrollTop on the first frame (no jump) and
        // to the new max bottom at settle (button fully in view).
        offsetAnimationRef.current = animate(dist, 0, {
          type: 'spring',
          stiffness: 320,
          damping: 28,
          mass: 0.5,
          onUpdate: (latest) => {
            if (stickyOffsetRef.current !== null) {
              stickyOffsetRef.current = latest
            }
          },
          onComplete: () => {
            offsetAnimationRef.current = null
          },
        })
      }
    }

    setExpanded((e) => !e)
  }

  return (
    <motion.section
      layout="position"
      transition={{ type: 'spring', stiffness: 320, damping: 28, mass: 0.5 }}
      className={styles.descSection}
    >
      <motion.h2
        layout="position"
        transition={{ type: 'spring', stiffness: 320, damping: 28, mass: 0.5 }}
        className={styles.descHeading}
      >
        About
      </motion.h2>
      <motion.div
        initial={false}
        animate={{ height: collapsed ? clampedHeight! : 'auto' }}
        transition={{ type: 'spring', stiffness: 320, damping: 28, mass: 0.5 }}
        onUpdate={() => {
          const offset = stickyOffsetRef.current
          if (offset === null) return
          const el = scrollParentRef.current
          if (!el) return
          el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight - offset)
        }}
        onAnimationComplete={() => {
          if (offsetAnimationRef.current) {
            offsetAnimationRef.current.stop()
            offsetAnimationRef.current = null
          }
          stickyOffsetRef.current = null
        }}
        style={{ overflow: 'hidden' }}
      >
        <p ref={ref} className={styles.descBody}>
          {description}
        </p>
      </motion.div>
      {overflows && (
        <motion.button
          layout="position"
          transition={{ type: 'spring', stiffness: 320, damping: 28, mass: 0.5 }}
          type="button"
          className={styles.descToggle}
          onClick={handleToggle}
          aria-expanded={expanded}
        >
          {expanded ? 'Read less' : 'Read more'}
        </motion.button>
      )}
    </motion.section>
  )
}

function buildWhenLine(event: SerializedBulletinEvent, status: BulletinEventStatus, now: Date): string {
  if (!event.schedulable) {
    if (status === 'draft') return 'Not started yet'
    if (status === 'happening' && event.starts_at) {
      return `Started ${formatEventDateTime(event.starts_at)}`
    }
    if (event.starts_at && event.ends_at) {
      return `${formatEventDateTime(event.starts_at)} → ${formatEventDateTime(event.ends_at)}`
    }
    return 'TBD'
  }
  if (event.starts_at && event.ends_at) {
    const range = formatEventTimeRange(event.starts_at, event.ends_at, now)
    return isEventCrossDay(event.starts_at, event.ends_at)
      ? range
      : `${formatEventDateLabel(event.starts_at, now)} · ${range}`
  }
  if (event.starts_at) return formatEventDateTime(event.starts_at)
  return 'TBD'
}

export default function EventDetailPanel({ event, onBack }: Props) {
  const now = useNowTick(1000)
  const status = computeBulletinEventStatus(event, now)
  const timer = buildTimer(event, now)

  const showProgress = status === 'happening' && !!(event.starts_at && event.ends_at)
  let progressTarget = 0
  if (showProgress && event.starts_at && event.ends_at) {
    const startMs = new Date(event.starts_at).getTime()
    const endMs = new Date(event.ends_at).getTime()
    const span = endMs - startMs
    progressTarget = span > 0 ? Math.max(0, Math.min(1, (now.getTime() - startMs) / span)) : 1
  }
  const progressSpring = useSpring(progressTarget, { stiffness: 120, damping: 24, mass: 0.6 })
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
  const pillColor = useColorLerp(happeningProgress, 'var(--color-dark-brown)', '#f5fff5')

  const whenLine = buildWhenLine(event, status, now)
  const duration = formatEventDuration(event.starts_at, event.ends_at) ?? '—'
  const isExpired = status === 'expired'
  const isDraft = status === 'draft'

  return (
    <Frame showBorderOnMobile className={styles.container}>
      <div className={styles.inner}>
        <div className={styles.body}>
          <motion.div
            layout="position"
            transition={{ type: 'spring', stiffness: 320, damping: 28, mass: 0.5 }}
            className={styles.hero}
          >
            {event.image_url ? (
              <img src={event.image_url} alt="" className={styles.heroImage} loading="lazy" />
            ) : (
              <div className={styles.heroPlaceholder} aria-hidden>
                <PhotoIcon className={styles.heroPlaceholderIcon} />
              </div>
            )}

            <div className={styles.heroOverlay} aria-hidden />

            <button type="button" onClick={onBack} aria-label="Back" className={styles.backButton}>
              <ArrowLeftIcon className={styles.backIcon} />
            </button>

            {isExpired || isDraft ? (
              <span className={clsx(styles.heroStatus, styles.heroStatusMuted)}>
                <TextMorph as="span">{STATUS_LABEL[status]}</TextMorph>
              </span>
            ) : (
              <motion.span
                layout
                transition={{ type: 'spring', stiffness: 320, damping: 28, mass: 0.5 }}
                className={clsx(styles.heroStatus, status === 'happening' && styles.heroStatusHappening)}
                style={{ backgroundColor: pillBg, color: pillColor }}
              >
                {status === 'happening' && <span className={styles.heroStatusDot} aria-hidden />}
                <TextMorph as="span">{STATUS_LABEL[status]}</TextMorph>
              </motion.span>
            )}

            <h1 className={styles.heroTitle}>{event.title}</h1>
          </motion.div>

          {timer && <BigTimer config={{ ...timer, progress: showProgress ? progressSpring : undefined }} />}

          <motion.div
            layout="position"
            transition={{ type: 'spring', stiffness: 320, damping: 28, mass: 0.5 }}
            className={styles.infoGrid}
          >
            <div className={styles.infoCard}>
              <div className={styles.infoIcon} aria-hidden>
                <CalendarDaysIcon />
              </div>
              <div className={styles.infoText}>
                <div className={styles.infoLabel}>When</div>
                <div className={styles.infoValue}>{whenLine}</div>
              </div>
            </div>
            <div className={styles.infoCard}>
              <div className={styles.infoIcon} aria-hidden>
                <ClockIcon />
              </div>
              <div className={styles.infoText}>
                <div className={styles.infoLabel}>Duration</div>
                <div className={styles.infoValue}>{duration}</div>
              </div>
            </div>
          </motion.div>

          {event.description && event.description.trim() && <DescriptionBlock description={event.description} />}
        </div>
      </div>
    </Frame>
  )
}
