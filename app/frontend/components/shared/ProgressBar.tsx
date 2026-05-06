import { type CSSProperties, useEffect, useRef, useState } from 'react'

type ProgressBarProps = {
  progress: number
  secondaryProgress?: number
  className?: string
  striped?: boolean
  trackClassName?: string
  animateAcrossVisitsKey?: string
  visitStepIndex?: number
  visitTotalSteps?: number
  celebrateOnComplete?: boolean
  completionKey?: string | number
  onCompleteVisualsFinished?: () => void
}

const BURST_PARTICLES = [
  { x: '34px', y: '-36px', delay: '0ms', size: '11px', color: 'var(--color-green)', radius: '999px', rotate: '36deg' },
  { x: '26px', y: '-24px', delay: '20ms', size: '9px', color: 'white', radius: '999px', rotate: '-24deg' },
  {
    x: '20px',
    y: '-44px',
    delay: '40ms',
    size: '10px',
    color: 'var(--color-light-green)',
    radius: '4px',
    rotate: '48deg',
  },
  { x: '12px', y: '-14px', delay: '70ms', size: '8px', color: 'var(--color-green)', radius: '3px', rotate: '20deg' },
  { x: '-10px', y: '-30px', delay: '15ms', size: '10px', color: 'white', radius: '999px', rotate: '-36deg' },
  {
    x: '-22px',
    y: '-18px',
    delay: '55ms',
    size: '9px',
    color: 'var(--color-light-green)',
    radius: '3px',
    rotate: '-52deg',
  },
  {
    x: '-30px',
    y: '-36px',
    delay: '85ms',
    size: '11px',
    color: 'var(--color-green)',
    radius: '999px',
    rotate: '-18deg',
  },
  { x: '-16px', y: '-10px', delay: '110ms', size: '8px', color: 'white', radius: '999px', rotate: '30deg' },
  {
    x: '38px',
    y: '-18px',
    delay: '95ms',
    size: '10px',
    color: 'var(--color-light-green)',
    radius: '3px',
    rotate: '64deg',
  },
  {
    x: '-36px',
    y: '-22px',
    delay: '105ms',
    size: '10px',
    color: 'var(--color-light-green)',
    radius: '3px',
    rotate: '-64deg',
  },
]

const completionVisualDurationMs = 980
const progressFillTransitionDurationMs = 500

function clampProgress(value: number): number {
  return Math.min(100, Math.max(0, value))
}

function loadRememberedProgress(
  storageKey: string,
  fallback: number,
  currentStepIndex?: number,
  currentTotalSteps?: number,
): number {
  if (typeof window === 'undefined') return fallback
  const saved = window.sessionStorage.getItem(storageKey)
  if (!saved) return fallback

  try {
    const parsed = JSON.parse(saved) as { value?: number; stepIndex?: number; totalSteps?: number }
    if (typeof parsed.value === 'number' && Number.isFinite(parsed.value)) {
      if (
        typeof currentStepIndex === 'number' &&
        typeof currentTotalSteps === 'number' &&
        typeof parsed.stepIndex === 'number' &&
        typeof parsed.totalSteps === 'number' &&
        (parsed.totalSteps !== currentTotalSteps || Math.abs(parsed.stepIndex - currentStepIndex) > 1)
      ) {
        return fallback
      }

      return clampProgress(parsed.value)
    }
  } catch {
    const legacyValue = Number(saved)
    if (Number.isFinite(legacyValue)) return clampProgress(legacyValue)
  }

  return fallback
}

const ProgressBar = ({
  progress,
  secondaryProgress,
  className = '',
  striped = true,
  trackClassName = '',
  animateAcrossVisitsKey,
  visitStepIndex,
  visitTotalSteps,
  celebrateOnComplete = false,
  completionKey,
  onCompleteVisualsFinished,
}: ProgressBarProps) => {
  const clampedSecondaryProgress = secondaryProgress !== undefined ? clampProgress(secondaryProgress) : undefined
  const clampedProgress = clampProgress(progress)
  const [animatedProgress, setAnimatedProgress] = useState(() =>
    animateAcrossVisitsKey
      ? loadRememberedProgress(animateAcrossVisitsKey, clampedProgress, visitStepIndex, visitTotalSteps)
      : clampedProgress,
  )
  const [completionPending, setCompletionPending] = useState(false)
  const [endColorActive, setEndColorActive] = useState(false)
  const [completionBurst, setCompletionBurst] = useState(0)
  const celebratedCompletionKeyRef = useRef<string | number | null>(null)
  const finishedCompletionKeyRef = useRef<string | number | null>(null)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setAnimatedProgress(clampedProgress))
    return () => cancelAnimationFrame(frame)
  }, [clampedProgress])

  useEffect(() => {
    if (!animateAcrossVisitsKey || typeof window === 'undefined') return
    window.sessionStorage.setItem(
      animateAcrossVisitsKey,
      JSON.stringify({
        value: clampedProgress,
        stepIndex: visitStepIndex,
        totalSteps: visitTotalSteps,
      }),
    )
  }, [animateAcrossVisitsKey, clampedProgress, visitStepIndex, visitTotalSteps])

  useEffect(() => {
    if (clampedProgress < 100) {
      setCompletionPending(false)
      setEndColorActive(false)
      return
    }

    if (!endColorActive) {
      setCompletionPending(true)
    }
  }, [clampedProgress, endColorActive])

  useEffect(() => {
    if (!completionPending || clampedProgress < 100 || animatedProgress < 100 || endColorActive) return

    const timeout = window.setTimeout(() => {
      setCompletionPending(false)
      setEndColorActive(true)

      if (celebrateOnComplete) {
        if (completionKey !== undefined) {
          if (celebratedCompletionKeyRef.current === completionKey) return
          celebratedCompletionKeyRef.current = completionKey
        }
        setCompletionBurst((prev) => prev + 1)
      }
    }, progressFillTransitionDurationMs)

    return () => window.clearTimeout(timeout)
  }, [animatedProgress, celebrateOnComplete, clampedProgress, completionKey, completionPending, endColorActive])

  useEffect(() => {
    if (!onCompleteVisualsFinished || clampedProgress < 100 || animatedProgress < 100 || !endColorActive) return
    if (celebrateOnComplete && completionBurst === 0) return
    if (completionKey !== undefined && finishedCompletionKeyRef.current === completionKey) return

    const timeout = window.setTimeout(
      () => {
        if (completionKey !== undefined) {
          finishedCompletionKeyRef.current = completionKey
        }
        onCompleteVisualsFinished()
      },
      celebrateOnComplete ? completionVisualDurationMs : 0,
    )
    return () => window.clearTimeout(timeout)
  }, [
    animatedProgress,
    celebrateOnComplete,
    clampedProgress,
    completionKey,
    completionBurst,
    endColorActive,
    onCompleteVisualsFinished,
  ])

  return (
    <div className={`w-full ${className}`}>
      <style>{`
        @keyframes progress-stripe {
          0% { background-position: 0 0; }
          100% { background-position: 42.43px 0; }
        }

        @keyframes progress-ripple {
          0% { transform: translate(0, -50%) scale(0.25); opacity: 0.95; }
          100% { transform: translate(0, -50%) scale(3.4); opacity: 0; }
        }

        @keyframes progress-ripple-soft {
          0% { transform: translate(0, -50%) scale(0.4); opacity: 0.7; }
          100% { transform: translate(0, -50%) scale(4.3); opacity: 0; }
        }

        @keyframes progress-core-pop {
          0% { transform: translate(0, -50%) scale(0.2); opacity: 0; }
          35% { transform: translate(0, -50%) scale(1.55); opacity: 1; }
          100% { transform: translate(0, -50%) scale(0); opacity: 0; }
        }

        @keyframes progress-particle {
          0% { transform: translate(0, -50%) scale(0.5) rotate(0deg); opacity: 0; }
          20% { opacity: 1; }
          100% {
            transform: translate(var(--particle-x), calc(-50% + var(--particle-y))) scale(0) rotate(var(--particle-rotate));
            opacity: 0;
          }
        }
      `}</style>

      <div className="w-full max-w-4xl mx-auto relative">
        <div className={`h-8 bg-white rounded-full border-3 border-gray-950 border-b-[6px] overflow-hidden relative ${trackClassName}`}>
          {clampedSecondaryProgress !== undefined && (
            <div
              className="absolute inset-y-0 left-0 transition-all duration-500 bg-light-blue"
              style={{ width: `${clampedSecondaryProgress}%` }}
            />
          )}
          <div
            className={`h-full transition-all duration-500 relative rounded-full ${endColorActive ? 'bg-green' : 'bg-blue'}`}
            style={{ width: `${animatedProgress}%` }}
          >
            {striped && (
              <div
                className="absolute inset-0 opacity-30 mix-blend-overlay"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(-45deg, transparent, transparent 15px, white 15px, white 30px)',
                  backgroundSize: '42.43px 42.43px',
                  animation: 'progress-stripe 1.5s linear infinite',
                }}
              />
            )}
          </div>
        </div>

        {celebrateOnComplete && completionBurst > 0 && (
          <div key={completionBurst} className="pointer-events-none absolute inset-0 overflow-visible">
            <span
              className="absolute right-1 top-1/2 w-10 h-10 rounded-full border-3"
              style={{
                borderColor: 'white',
                transform: 'translate(0, -50%)',
                animation: 'progress-ripple 620ms ease-out both',
              }}
            />
            <span
              className="absolute right-1 top-1/2 w-14 h-14 rounded-full border-3"
              style={{
                borderColor: 'var(--color-green)',
                transform: 'translate(0, -50%)',
                animation: 'progress-ripple-soft 760ms ease-out 30ms both',
              }}
            />
            <span
              className="absolute right-1 top-1/2 w-16 h-16 rounded-full border-2"
              style={{
                borderColor: 'var(--color-green)',
                transform: 'translate(0, -50%)',
                animation: 'progress-ripple-soft 860ms ease-out 60ms both',
              }}
            />
            <span
              className="absolute right-1 top-1/2 w-5 h-5 rounded-full"
              style={{
                backgroundColor: 'white',
                transform: 'translate(0, -50%)',
                boxShadow: '0 0 0 3px var(--color-green)',
                animation: 'progress-core-pop 540ms ease-out both',
              }}
            />

            {BURST_PARTICLES.map((particle, i) => (
              <span
                key={i}
                className="absolute right-1 top-1/2"
                style={
                  {
                    width: particle.size,
                    height: particle.size,
                    backgroundColor: particle.color,
                    borderRadius: particle.radius,
                    '--particle-x': particle.x,
                    '--particle-y': particle.y,
                    '--particle-rotate': particle.rotate,
                    transform: 'translate(0, -50%)',
                    boxShadow: particle.radius === '999px' ? '0 0 0 2px var(--color-green)' : 'none',
                    animation: `progress-particle 740ms cubic-bezier(0.2, 0.8, 0.1, 1) ${particle.delay} both`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default ProgressBar
