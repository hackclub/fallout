import { type ReactNode, useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { router } from '@inertiajs/react'
import { Modal, useModal } from '@inertiaui/modal-react'
import { motion, AnimatePresence } from 'motion/react'
import Axios from 'axios'
import Frame from '@/components/shared/Frame'
import Button from '@/components/shared/Button'
import { notify } from '@/lib/notifications'

type GoalData = {
  target_days: number
  progress: number
  frozen_days: number
  completed: boolean
  started_on: string
  notify_streak_events: boolean
}

type PageProps = {
  goal: GoalData | null
  current_streak: number
  streak_freezes: number
  targets?: number[]
  last_goal_event?: { type: string; target_days: number } | null
  is_modal: boolean
}

const TARGET_LABELS: Record<number, string> = {
  3: '3 days',
  5: '5 days',
  7: '1 week',
  14: '2 weeks',
}

const GOAL_REWARDS: Record<number, number> = {
  3: 1,
  5: 2,
  7: 5,
  14: 10,
}

const MASCOT_SPRING = { type: 'spring' as const, stiffness: 900, damping: 110, mass: 10 }

function modalHeaders() {
  return {
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    'X-CSRF-Token': document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content || '',
    'X-InertiaUI-Modal': crypto.randomUUID(),
    'X-InertiaUI-Modal-Use-Router': 0,
  }
}

function StreakGoalShow({ goal, current_streak, streak_freezes, targets, last_goal_event, is_modal }: PageProps) {
  const [confirming, setConfirming] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)
  const [overlayRect, setOverlayRect] = useState<{ top: number; height: number } | null>(null)
  const [closing, setClosing] = useState(false)
  const [optOut, setOptOut] = useState(false)
  const [showOptOutConfirm, setShowOptOutConfirm] = useState(false)
  const modal = useModal()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map())

  const showMascot = !goal && !confirming && !closing

  useLayoutEffect(() => {
    if (!selected || !wrapperRef.current) {
      setOverlayRect(null)
      return
    }
    const btn = itemRefs.current.get(selected)
    if (!btn) return
    const wrapperTop = wrapperRef.current.getBoundingClientRect().top
    const btnRect = btn.getBoundingClientRect()
    setOverlayRect({ top: btnRect.top - wrapperTop, height: btnRect.height })
  }, [selected])

  function commitToGoal(days: number) {
    const payload = { target_days: days, notify_streak_events: !optOut }
    if (is_modal) {
      Axios.post('/streak_goal', payload, { headers: modalHeaders() })
        .then(() =>
          modal?.reload({
            only: ['goal', 'current_streak', 'streak_freezes', 'targets', 'last_goal_event', 'is_modal'],
          }),
        )
        .catch(() => notify('alert', 'Failed to set streak goal.'))
    } else {
      router.post('/streak_goal', payload, { preserveScroll: true })
    }
  }

  function abandonGoal() {
    if (is_modal) {
      Axios.delete('/streak_goal', { headers: modalHeaders() })
        .then(() => {
          setConfirming(false)
          modal?.reload({
            only: ['goal', 'current_streak', 'streak_freezes', 'targets', 'last_goal_event', 'is_modal'],
          })
        })
        .catch(() => notify('alert', 'Failed to remove streak goal.'))
    } else {
      router.delete('/streak_goal', { preserveScroll: true, onSuccess: () => setConfirming(false) })
    }
  }

  const mascot = (
    <AnimatePresence>
      {showMascot && (
        <motion.div
          key="mascot"
          initial={{ y: 300 }}
          animate={{ y: 0 }}
          exit={{ y: 500 }}
          transition={MASCOT_SPRING}
          className="fixed bottom-16 left-20 z-[9999] rotate-2 flex flex-col items-start pointer-events-none"
        >
          <div className="relative bg-white border-2 border-dark-brown rounded-xl px-5 py-4 mb-2 max-w-[18rem]">
            <p className="text-dark-brown text-base font-bold text-center">
              Challenge yourself and earn more Koi with Streak Goal!
            </p>
            <div className="absolute -bottom-2 left-7 w-4 h-4 bg-white border-b-2 border-l-2 border-dark-brown rotate-[-45deg]" />
          </div>
          <img src="/onboarding/chinese_heidi.webp" alt="" className="w-48 h-48 object-contain" />
        </motion.div>
      )}
    </AnimatePresence>
  )

  const contentRef = useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = useState<number | 'auto'>('auto')

  const measureHeight = useCallback(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight)
    }
  }, [])

  useEffect(() => {
    measureHeight()
  }, [confirming, goal, measureHeight])

  const content = (
    <motion.div
      animate={{ height: contentHeight }}
      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
      className="w-full overflow-hidden"
    >
      <div ref={contentRef} className="flex flex-col p-4 md:p-6">
        <AnimatePresence mode="popLayout" initial={false}>
          {confirming ? (
            <motion.div
              key="confirming"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onAnimationStart={measureHeight}
              className="flex flex-col items-center justify-center text-center py-8"
            >
              <p className="text-dark-brown font-bold text-lg mb-2">Are you sure?</p>
              <p className="text-brown text-sm mb-6">
                Changing your goal will reset your progress. You won't receive the reward for your current goal.
              </p>
              <div className="flex gap-3">
                <Button onClick={() => setConfirming(false)}>Keep goal</Button>
                <Button variant="link" onClick={abandonGoal} className="text-sm text-brown">
                  Change anyway
                </Button>
              </div>
            </motion.div>
          ) : goal ? (
            <motion.div
              key="progress"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onAnimationStart={measureHeight}
              className="flex flex-col"
            >
              <div className="flex items-center justify-between mb-6">
                <h1 className="font-bold text-2xl text-dark-brown">Streak Goal</h1>
                <span className="flex items-center gap-1 text-sm font-bold text-light-brown bg-brown border-2 border-dark-brown rounded-full px-3 py-1">
                  <img src="/frozen-fire.svg" alt="streak freeze" className="h-4 w-4" />
                  {streak_freezes}
                </span>
              </div>

              <div className="text-center mb-6">
                <span className="text-5xl font-bold text-dark-brown">{current_streak}</span>
                <p className="text-dark-brown text-sm mt-1">day streak</p>
              </div>

              <p className="text-dark-brown font-bold text-lg mb-1">
                {TARGET_LABELS[goal.target_days] ?? `${goal.target_days} days`}
              </p>
              <p className="text-brown text-sm mb-4">
                {goal.completed ? 'Goal completed!' : `${goal.progress} of ${goal.target_days} days`}
              </p>

              <style>{`
                @keyframes streak-stripe {
                  0% { background-position: 0 0; }
                  100% { background-position: 42.43px 0; }
                }
              `}</style>
              {(() => {
                const activeDays = goal.progress - goal.frozen_days
                const activePct = Math.min((activeDays / goal.target_days) * 100, 100)
                const frozenPct = Math.min((goal.progress / goal.target_days) * 100, 100)
                const fillGradient =
                  goal.frozen_days > 0 && frozenPct > 0
                    ? `linear-gradient(to right, #ff7d70 0%, #ff7d70 ${(activePct / frozenPct) * 100}%, #c3efff ${(activePct / frozenPct) * 100}%, #c3efff 100%)`
                    : '#ff7d70'
                return (
                  <div
                    className="w-full h-6 rounded-full border-2 border-dark-brown relative"
                    style={{ background: '#9f715d', boxShadow: '0 2px 0 0 #61453a' }}
                  >
                    <div
                      className="h-full rounded-full overflow-hidden transition-all duration-500 relative"
                      style={{ width: `${frozenPct}%`, background: fillGradient }}
                    >
                      <div
                        className="absolute inset-0 opacity-20 mix-blend-overlay"
                        style={{
                          backgroundImage:
                            'repeating-linear-gradient(-45deg, transparent, transparent 15px, white 15px, white 30px)',
                          backgroundSize: '42.43px 42.43px',
                          animation: 'streak-stripe 1.5s linear infinite',
                        }}
                      />
                    </div>
                  </div>
                )
              })()}

              {goal.completed && (
                <div className="bg-light-green rounded-lg border-2 border-dark-brown px-4 py-3 text-center mt-4">
                  <p className="text-dark-brown font-bold text-sm">
                    You completed this goal! Pick a new one to keep going.
                  </p>
                </div>
              )}

              <div className="pt-6">
                {goal.completed ? (
                  <Button onClick={abandonGoal} className="w-full py-3 text-xl rounded-lg">
                    Set new goal
                  </Button>
                ) : (
                  <Button onClick={() => setConfirming(true)} variant="link" className="text-sm text-brown">
                    Change goal
                  </Button>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="selection"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onAnimationStart={measureHeight}
              className="flex flex-col items-center"
            >
              {last_goal_event && (
                <div
                  className={`w-full rounded-lg border-2 border-dark-brown px-4 py-3 mb-4 text-center text-sm font-bold ${
                    last_goal_event.type === 'goal_completed'
                      ? 'bg-light-green text-dark-brown'
                      : 'bg-coral text-dark-brown'
                  }`}
                >
                  {last_goal_event.type === 'goal_completed'
                    ? `You completed your ${last_goal_event.target_days}-day streak goal!`
                    : `Your ${last_goal_event.target_days}-day streak goal ended.`}
                </div>
              )}
              <h1 className="font-bold text-3xl text-dark-brown text-center mb-6">Commit to a Streak Goal!</h1>
              <div ref={wrapperRef} className="w-full relative">
                <div className="w-full border-2 border-dark-brown rounded-lg overflow-hidden">
                  {(targets ?? []).map((days, i) => (
                    <button
                      key={days}
                      ref={(el) => {
                        if (el) itemRefs.current.set(days, el)
                      }}
                      type="button"
                      onClick={() => setSelected(days)}
                      className={`w-full px-4 py-3 flex items-center justify-between cursor-pointer bg-light-brown text-dark-brown ${i > 0 ? 'border-t-2 border-dark-brown' : ''}`}
                    >
                      <span className="text-lg font-bold">{TARGET_LABELS[days] ?? `${days} days`}</span>
                      {GOAL_REWARDS[days] != null && (
                        <span className="flex items-center gap-1 text-sm font-bold text-brown">
                          <img src="/koifish.webp" alt="koi" className="h-5 w-5 object-contain" />
                          {GOAL_REWARDS[days]}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                <AnimatePresence mode="wait">
                  {selected && overlayRect && (
                    <motion.div
                      key={selected}
                      initial={{ scale: 1 }}
                      animate={{ scale: 1.05 }}
                      transition={{ type: 'spring', stiffness: 1000, damping: 50 }}
                      className="absolute z-10 bg-brown text-light-brown text-lg font-bold rounded-lg border-2 border-dark-brown flex items-center justify-between px-4 cursor-pointer"
                      style={{
                        top: overlayRect.top,
                        left: 0,
                        right: 0,
                        height: overlayRect.height,
                        boxShadow: '0 2px 0 0 #61453a',
                      }}
                    >
                      <span>{TARGET_LABELS[selected] ?? `${selected} days`}</span>
                      {GOAL_REWARDS[selected] != null && (
                        <span className="flex items-center gap-1 text-sm font-bold">
                          <img src="/koifish.webp" alt="koi" className="h-5 w-5 object-contain" />
                          {GOAL_REWARDS[selected]}
                        </span>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="mt-6 w-full">
                <div className="mb-4 relative">
                  <label
                    className="flex items-start gap-3 cursor-pointer group"
                    onClick={(e) => {
                      e.preventDefault()
                      if (!optOut) setShowOptOutConfirm(true)
                      else setOptOut(false)
                    }}
                  >
                    <div
                      className={`mt-0.5 w-5 h-5 shrink-0 rounded border-2 border-dark-brown flex items-center justify-center transition-colors ${optOut ? 'bg-dark-brown' : 'bg-light-brown'}`}
                    >
                      {optOut && (
                        <svg viewBox="0 0 12 10" fill="none" className="w-3 h-3" xmlns="http://www.w3.org/2000/svg">
                          <path
                            d="M1 5l3.5 3.5L11 1"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="text-light-brown"
                          />
                        </svg>
                      )}
                    </div>
                    <span className="text-sm text-brown leading-snug">
                      Do NOT notify me if my streak breaks or if a streak freeze had been applied.
                    </span>
                  </label>
                  <AnimatePresence>
                    {showOptOutConfirm && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 4 }}
                        transition={{ type: 'spring', stiffness: 600, damping: 30 }}
                        className="absolute bottom-full left-0 mb-2 w-full bg-light-brown border-2 border-dark-brown rounded-lg px-4 py-3 z-10"
                      >
                        <p className="text-dark-brown font-bold text-sm mb-3">
                          You sure? You'll miss important streak alerts.
                        </p>
                        <div className="flex gap-2">
                          <Button onClick={() => setShowOptOutConfirm(false)} className="text-sm py-1 px-3">
                            Never mind
                          </Button>
                          <Button
                            variant="link"
                            onClick={() => {
                              setOptOut(true)
                              setShowOptOutConfirm(false)
                            }}
                            className="text-sm text-brown"
                          >
                            Yes, opt out
                          </Button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <Button
                  onClick={() => selected && commitToGoal(selected)}
                  disabled={!selected}
                  className="w-full py-3 text-xl rounded-lg"
                >
                  continue
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )

  if (is_modal) {
    return (
      <>
        <Modal panelClasses="" paddingClasses="max-w-md mx-auto" closeButton={false} onClose={() => setClosing(true)}>
          <Frame showBorderOnMobile>{content}</Frame>
        </Modal>
        {createPortal(mascot, document.body)}
      </>
    )
  }

  return (
    <>
      {content}
      {mascot}
    </>
  )
}

StreakGoalShow.layout = (page: ReactNode) => page

export default StreakGoalShow
