import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Clock, Lock } from 'lucide-react'
import Confetti from '@/components/shared/Confetti'
import { SlidingNumber } from '@/components/shared/SlidingNumber'

// June 20, 2026 11:59 PM America/New_York (EDT, UTC-4) → 2026-06-21T03:59:00Z.
// Hard-coded UTC instant so the countdown is correct regardless of viewer locale.
const TARGET_UTC = new Date('2026-06-21T03:59:00Z')

const ONE_HOUR_MS = 60 * 60 * 1000
const ONE_DAY_MS = 24 * ONE_HOUR_MS

const LAYOUT_SPRING = { type: 'spring' as const, stiffness: 380, damping: 32, mass: 0.6 }
const BLUR_EASE = [0.22, 1, 0.36, 1] as const
const BLUR_TRANSITION = { duration: 0.22, ease: BLUR_EASE }
const HIDDEN = { opacity: 0, filter: 'blur(8px)' }
const VISIBLE = { opacity: 1, filter: 'blur(0px)' }

type Tier = 'normal' | 'soon' | 'urgent' | 'closed'
type Split = { days: number; hours: number; mins: number; secs: number }

function splitDiff(ms: number): Split {
  if (ms <= 0) return { days: 0, hours: 0, mins: 0, secs: 0 }
  return {
    days: Math.floor(ms / ONE_DAY_MS),
    hours: Math.floor((ms % ONE_DAY_MS) / ONE_HOUR_MS),
    mins: Math.floor((ms % ONE_HOUR_MS) / (60 * 1000)),
    secs: Math.floor((ms % (60 * 1000)) / 1000),
  }
}

function tierOf(ms: number): Tier {
  if (ms <= 0) return 'closed'
  if (ms <= ONE_HOUR_MS) return 'urgent'
  if (ms <= ONE_DAY_MS) return 'soon'
  return 'normal'
}

function compactDisplay({ days, hours, mins, secs }: Split): string {
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins}m`
  if (mins > 0) return `${mins}m ${secs}s`
  return `${secs}s`
}

function ariaLabel(split: Split, tier: Tier): string {
  if (tier === 'closed') return '60-hour deadline passed'
  return `60-hour deadline in ${split.days} days, ${split.hours} hours, ${split.mins} minutes, ${split.secs} seconds`
}

function useExpanded(disabled: boolean, canHover: boolean) {
  const [expanded, setExpanded] = useState(false)
  const focusedRef = useRef(false)
  const leaveTimer = useRef<number | null>(null)
  const autoCollapseTimer = useRef<number | null>(null)

  function clearLeave() {
    if (leaveTimer.current != null) {
      window.clearTimeout(leaveTimer.current)
      leaveTimer.current = null
    }
  }
  function clearAuto() {
    if (autoCollapseTimer.current != null) {
      window.clearTimeout(autoCollapseTimer.current)
      autoCollapseTimer.current = null
    }
  }

  useEffect(
    () => () => {
      clearLeave()
      clearAuto()
    },
    [],
  )

  useEffect(() => {
    if (disabled && expanded) setExpanded(false)
  }, [disabled, expanded])

  const handlers = {
    onMouseEnter: () => {
      if (disabled) return
      clearLeave()
      setExpanded(true)
    },
    onMouseLeave: () => {
      if (disabled || focusedRef.current) return
      clearLeave()
      leaveTimer.current = window.setTimeout(() => setExpanded(false), 80)
    },
    onFocus: () => {
      if (disabled) return
      focusedRef.current = true
      clearLeave()
      setExpanded(true)
    },
    onBlur: () => {
      if (disabled) return
      focusedRef.current = false
      setExpanded(false)
    },
    // Tap-to-toggle only on devices without hover — desktop already handles via hover,
    // and double-firing click+mouseEnter would otherwise close the panel right after opening.
    onClick: () => {
      if (disabled || canHover) return
      clearAuto()
      setExpanded((prev) => {
        const next = !prev
        if (next) autoCollapseTimer.current = window.setTimeout(() => setExpanded(false), 5000)
        return next
      })
    },
    onPointerMove: () => {
      if (disabled || autoCollapseTimer.current == null) return
      clearAuto()
      autoCollapseTimer.current = window.setTimeout(() => setExpanded(false), 5000)
    },
  }

  return { expanded, handlers }
}

function LiveDot({ tier }: { tier: Tier }) {
  if (tier !== 'soon' && tier !== 'urgent') return null
  const pingDuration = tier === 'urgent' ? '1s' : '2s'
  return (
    <motion.span
      layoutId="countdown-live-dot"
      transition={LAYOUT_SPRING}
      className="relative inline-flex h-1.5 w-1.5 shrink-0"
    >
      <span
        className="absolute inline-flex h-full w-full rounded-full bg-coral opacity-75 motion-safe:animate-ping"
        style={{ animationDuration: pingDuration }}
      />
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-coral" />
    </motion.span>
  )
}

function Unit({
  value,
  label,
  numberClass,
  labelClass,
}: {
  value: number
  label: string
  numberClass: string
  labelClass: string
}) {
  return (
    <div className="flex flex-col items-center leading-none">
      <div className={`font-bold tabular-nums text-2xl xs:text-3xl sm:text-4xl ${numberClass}`}>
        <SlidingNumber value={value} padStart />
      </div>
      <span className={`mt-1 text-[9px] xs:text-[10px] uppercase tracking-[0.18em] ${labelClass}`}>{label}</span>
    </div>
  )
}

function Sep({ color }: { color: string }) {
  return <span className={`text-2xl xs:text-3xl sm:text-4xl font-light leading-none ${color}`}>·</span>
}

export default function SubmissionCountdown() {
  const [diffMs, setDiffMs] = useState<number | null>(null)
  const [confettiActive, setConfettiActive] = useState(false)
  const prevDiffRef = useRef<number | null>(null)
  const reducedMotion = useReducedMotion() ?? false
  const canHover = useMemo(() => {
    if (typeof window === 'undefined') return true
    return window.matchMedia('(hover: hover)').matches
  }, [])

  useEffect(() => {
    function tick() {
      setDiffMs(TARGET_UTC.getTime() - Date.now())
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [])

  // Fire confetti exactly once, on the tick that crosses the deadline mid-session.
  // Skipped on page loads after the deadline (prev stays null on first observation
  // of a negative diff), so confetti never spam-fires on reloads.
  useEffect(() => {
    if (diffMs == null) return
    const prev = prevDiffRef.current
    prevDiffRef.current = diffMs
    if (prev != null && prev > 0 && diffMs <= 0) {
      setConfettiActive(true)
      const t = window.setTimeout(() => setConfettiActive(false), 6000)
      return () => window.clearTimeout(t)
    }
  }, [diffMs])

  const tier: Tier = diffMs == null ? 'normal' : tierOf(diffMs)
  const split = diffMs == null ? { days: 0, hours: 0, mins: 0, secs: 0 } : splitDiff(diffMs)
  const closed = tier === 'closed'
  const { expanded: openState, handlers } = useExpanded(closed, canHover)
  const expanded = openState && !closed

  const Icon = closed ? Lock : Clock
  const compactText = closed ? 'Deadline passed' : compactDisplay(split)
  const compactColor = tier === 'urgent' ? 'text-coral' : 'text-beige'
  const titleColor = tier === 'urgent' ? 'text-coral' : 'text-light-brown'
  const numberClass = tier === 'urgent' ? 'text-coral' : 'text-beige'
  const labelClass = tier === 'urgent' || tier === 'soon' ? 'text-coral' : 'text-light-brown'
  const sepClass = tier === 'urgent' || tier === 'soon' ? 'text-coral' : 'text-brown'

  const layoutTransition = reducedMotion ? { duration: 0 } : LAYOUT_SPRING
  const contentTransition = reducedMotion ? { duration: 0 } : BLUR_TRANSITION
  const contentHidden = reducedMotion ? { opacity: 0 } : HIDDEN
  const contentVisible = reducedMotion ? { opacity: 1 } : VISIBLE

  return (
    <>
      <Confetti active={confettiActive} />
      <motion.div
        layout
        transition={layoutTransition}
        role="button"
        tabIndex={closed ? -1 : 0}
        aria-expanded={expanded}
        aria-label={ariaLabel(split, tier)}
        {...handlers}
        style={{ borderRadius: expanded ? 24 : 9999 }}
        className="pointer-events-auto bg-dark-brown shadow-xl cursor-pointer overflow-hidden max-w-[calc(100vw-1.5rem)] focus-visible:outline-2 focus-visible:outline-coral focus-visible:outline-offset-2"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {expanded ? (
            <motion.div
              key="expanded"
              initial={contentHidden}
              animate={contentVisible}
              exit={contentHidden}
              transition={contentTransition}
              className="flex flex-col items-center px-6 py-3 xs:px-7"
            >
              <div
                className={`mb-2 flex items-center gap-2 text-[10px] xs:text-xs uppercase tracking-[0.24em] ${titleColor}`}
              >
                <motion.span layoutId="countdown-icon" transition={LAYOUT_SPRING} className="inline-flex">
                  <Icon className="size-3.5 shrink-0" strokeWidth={2.5} />
                </motion.span>
                <span className="whitespace-nowrap">60-hour deadline in</span>
                <LiveDot tier={tier} />
              </div>

              <div className="flex items-center gap-2.5 xs:gap-4">
                <Unit value={split.days} label="Days" numberClass={numberClass} labelClass={labelClass} />
                <Sep color={sepClass} />
                <Unit value={split.hours} label="Hrs" numberClass={numberClass} labelClass={labelClass} />
                <Sep color={sepClass} />
                <Unit value={split.mins} label="Min" numberClass={numberClass} labelClass={labelClass} />
                <Sep color={sepClass} />
                <Unit value={split.secs} label="Sec" numberClass={numberClass} labelClass={labelClass} />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="collapsed"
              initial={contentHidden}
              animate={contentVisible}
              exit={contentHidden}
              transition={contentTransition}
              className="flex items-center gap-2 px-3.5 py-1.5"
            >
              <motion.span
                layoutId="countdown-icon"
                transition={LAYOUT_SPRING}
                className={`inline-flex ${compactColor}`}
              >
                <Icon className="size-3.5 shrink-0" strokeWidth={2.5} />
              </motion.span>
              <span className={`font-semibold tabular-nums text-sm leading-none whitespace-nowrap ${compactColor}`}>
                {compactText}
              </span>
              <LiveDot tier={tier} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  )
}
