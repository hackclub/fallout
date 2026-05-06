import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import React from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { twMerge } from 'tailwind-merge'

type Side = 'top' | 'bottom' | 'left' | 'right'
type Pos = { top: number; left: number; side: Side }

type CtxValue = {
  open: boolean
  setOpen: (v: boolean) => void
  triggerRef: React.RefObject<HTMLElement | null>
  side: Side
  autoFlip: boolean
  gap: number
  trackScroll: boolean
  alwaysShow: boolean
  disabled: boolean
  snapWhenOffscreen: (() => { x: number; y: number }) | false
  onSnapClick?: () => void
}

const Ctx = createContext<CtxValue | null>(null)

function useCtx() {
  const v = useContext(Ctx)
  if (!v) throw new Error('Tooltip components must be used inside <Tooltip>')
  return v
}

const DEFAULT_GAP = 10

let bobStyleInjected = false
function ensureBobKeyframes() {
  if (bobStyleInjected) return
  bobStyleInjected = true
  const style = document.createElement('style')
  style.textContent = `@keyframes tooltip-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}`
  document.head.appendChild(style)
}

export function Tooltip({
  children,
  side = 'right',
  autoFlip = true,
  gap = DEFAULT_GAP,
  trackScroll = false,
  alwaysShow = false,
  disabled = false,
  snapWhenOffscreen = false,
  onSnapClick,
}: {
  children: ReactNode
  side?: Side
  autoFlip?: boolean
  gap?: number
  trackScroll?: boolean
  alwaysShow?: boolean
  disabled?: boolean
  snapWhenOffscreen?: (() => { x: number; y: number }) | false
  onSnapClick?: () => void
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLElement>(null)
  const effectiveOpen = !disabled && (alwaysShow || open)
  return (
    <Ctx.Provider
      value={{
        open: effectiveOpen,
        setOpen,
        triggerRef,
        side,
        autoFlip,
        gap,
        trackScroll,
        alwaysShow,
        disabled,
        snapWhenOffscreen,
        onSnapClick,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function TooltipTrigger({ children, asChild }: { children: ReactNode; asChild?: boolean }) {
  const { setOpen, triggerRef, alwaysShow, disabled } = useCtx()

  const handlers =
    alwaysShow || disabled
      ? {}
      : {
          onMouseEnter: () => setOpen(true),
          onMouseLeave: () => setOpen(false),
          onFocus: () => setOpen(true),
          onBlur: () => setOpen(false),
        }

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
      ...handlers,
      ref: triggerRef,
    })
  }

  return (
    <span ref={triggerRef as React.RefObject<HTMLSpanElement>} {...handlers}>
      {children}
    </span>
  )
}

const OPPOSITE: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }

function computePos(tr: DOMRect, tt: DOMRect, side: Side, autoFlip: boolean, gap: number): Pos {
  const vw = window.innerWidth
  const vh = window.innerHeight

  function fits(s: Side): boolean {
    switch (s) {
      case 'top':
        return tr.top - tt.height - gap >= 0
      case 'bottom':
        return tr.bottom + tt.height + gap <= vh
      case 'left':
        return tr.left - tt.width - gap >= 0
      case 'right':
        return vw - tr.right >= tt.width + gap
    }
  }

  let resolved = side
  if (autoFlip && !fits(side)) {
    const opp = OPPOSITE[side]
    if (fits(opp)) resolved = opp
  }

  let top: number
  let left: number

  switch (resolved) {
    case 'top':
      top = tr.top - tt.height - gap
      left = tr.left + tr.width / 2 - tt.width / 2
      break
    case 'bottom':
      top = tr.bottom + gap
      left = tr.left + tr.width / 2 - tt.width / 2
      break
    case 'left':
      top = tr.top + tr.height / 2 - tt.height / 2
      left = tr.left - tt.width - gap
      break
    case 'right':
      top = tr.top + tr.height / 2 - tt.height / 2
      left = tr.right + gap
      break
  }

  top = Math.max(8, Math.min(vh - tt.height - 8, top))
  left = Math.max(8, Math.min(vw - tt.width - 8, left))

  return { top, left, side: resolved }
}

function Arrow({ side }: { side: Side }) {
  const shared = 'absolute w-0 h-0'

  const borderStyles: Record<Side, [React.CSSProperties, React.CSSProperties]> = {
    top: [
      {
        top: '100%',
        left: '50%',
        transform: 'translateX(-50%)',
        borderLeft: '8px solid transparent',
        borderRight: '8px solid transparent',
        borderTop: '8px solid #61453a',
      },
      {
        top: 'calc(100% - 2px)',
        left: '50%',
        transform: 'translateX(-50%)',
        borderLeft: '7px solid transparent',
        borderRight: '7px solid transparent',
        borderTop: '7px solid #edd1b0',
      },
    ],
    bottom: [
      {
        bottom: '100%',
        left: '50%',
        transform: 'translateX(-50%)',
        borderLeft: '8px solid transparent',
        borderRight: '8px solid transparent',
        borderBottom: '8px solid #61453a',
      },
      {
        bottom: 'calc(100% - 2px)',
        left: '50%',
        transform: 'translateX(-50%)',
        borderLeft: '7px solid transparent',
        borderRight: '7px solid transparent',
        borderBottom: '7px solid #edd1b0',
      },
    ],
    left: [
      {
        left: '100%',
        top: '50%',
        transform: 'translateY(-50%)',
        borderTop: '8px solid transparent',
        borderBottom: '8px solid transparent',
        borderLeft: '8px solid #61453a',
      },
      {
        left: 'calc(100% - 2px)',
        top: '50%',
        transform: 'translateY(-50%)',
        borderTop: '7px solid transparent',
        borderBottom: '7px solid transparent',
        borderLeft: '7px solid #edd1b0',
      },
    ],
    right: [
      {
        right: '100%',
        top: '50%',
        transform: 'translateY(-50%)',
        borderTop: '8px solid transparent',
        borderBottom: '8px solid transparent',
        borderRight: '8px solid #61453a',
      },
      {
        right: 'calc(100% - 2px)',
        top: '50%',
        transform: 'translateY(-50%)',
        borderTop: '7px solid transparent',
        borderBottom: '7px solid transparent',
        borderRight: '7px solid #edd1b0',
      },
    ],
  }

  const [outer, inner] = borderStyles[side]

  return (
    <>
      <span aria-hidden className={shared} style={outer} />
      <span aria-hidden className={shared} style={inner} />
    </>
  )
}

export function TooltipContent({ children, className }: { children: ReactNode; className?: string }) {
  const { open, setOpen, triggerRef, side, autoFlip, gap, trackScroll, snapWhenOffscreen, onSnapClick } = useCtx()
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<Pos | null>(null)
  const posRef = useRef<Pos | null>(null)
  const snappedRef = useRef(false)
  const [isSnapped, setIsSnapped] = useState(false)

  const applyPos = useCallback(
    (el: HTMLDivElement, tr: DOMRect) => {
      const tt = el.getBoundingClientRect()
      const p = computePos(tr, tt, side, autoFlip, gap)
      el.style.top = `${p.top}px`
      el.style.left = `${p.left}px`
      el.style.visibility = 'visible'
      if (snappedRef.current) {
        snappedRef.current = false
        setIsSnapped(false)
        el.style.animation = ''
      }
      // Update React state only when resolved side changes (for arrow direction)
      if (posRef.current?.side !== p.side) setPos(p)
      posRef.current = p
    },
    [side, autoFlip, gap],
  )

  // Initial positioning via React state (for arrow render)
  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      posRef.current = null
      return
    }
    if (!ref.current || !triggerRef.current) return
    const tr = triggerRef.current.getBoundingClientRect()
    const tt = ref.current.getBoundingClientRect()
    const p = computePos(tr, tt, side, autoFlip, gap)
    setPos(p)
    posRef.current = p
  }, [open, triggerRef, side, autoFlip, gap])

  // Scroll tracking via direct DOM mutation (bypasses React for speed)
  useEffect(() => {
    if (!open || !trackScroll) return

    let pending = false
    const update = () => {
      pending = false
      if (!ref.current || !triggerRef.current) return
      const tr = triggerRef.current.getBoundingClientRect()
      const vh = window.innerHeight
      const vw = window.innerWidth
      // Zero-size rect means the element is display:none (culled) — treat as offscreen
      if (tr.bottom < 0 || tr.top > vh || tr.right < 0 || tr.left > vw || (tr.width === 0 && tr.height === 0)) {
        if (snapWhenOffscreen) {
          const snap = snapWhenOffscreen()
          const el = ref.current
          const ttW = el.offsetWidth
          const ttH = el.offsetHeight
          const snapLeft = Math.max(8, Math.min(vw - ttW - 8, snap.x - ttW / 2))
          const snapTop = snap.y - ttH - gap
          el.style.top = `${snapTop}px`
          el.style.left = `${snapLeft}px`
          el.style.visibility = 'visible'
          if (!snappedRef.current) {
            snappedRef.current = true
            setIsSnapped(true)
            ensureBobKeyframes()
            el.style.animation = 'tooltip-bob 1.2s ease-in-out infinite'
          }
          const snapSide: Side = 'top'
          if (posRef.current?.side !== snapSide) setPos({ top: snapTop, left: snapLeft, side: snapSide })
          posRef.current = { top: snapTop, left: snapLeft, side: snapSide }
          return
        }
        setOpen(false)
        return
      }
      applyPos(ref.current, tr)
    }

    const onScroll = () => {
      if (!pending) {
        pending = true
        requestAnimationFrame(update)
      }
    }

    const onScrollEnd = () => update()

    // Initial reposition after paint (trigger may not be in final position during useLayoutEffect)
    const initialRaf = requestAnimationFrame(update)

    // Catch-all interval corrects drift when rAF/scroll events are throttled (e.g. Safari)
    const interval = setInterval(update, 100)

    window.addEventListener('scroll', onScroll, { capture: true, passive: true })
    window.addEventListener('scrollend', onScrollEnd, { capture: true, passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      clearInterval(interval)
      cancelAnimationFrame(initialRaf)
      window.removeEventListener('scroll', onScroll, { capture: true })
      window.removeEventListener('scrollend', onScrollEnd, { capture: true })
      window.removeEventListener('resize', onScroll)
    }
  }, [open, trackScroll, triggerRef, setOpen, applyPos, snapWhenOffscreen])

  if (!open) return null

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      className={twMerge(
        'fixed z-50 px-3 py-2 text-sm rounded',
        isSnapped && onSnapClick ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none',
        'bg-light-brown border-2 border-dark-brown text-dark-brown shadow-md',
        className,
      )}
      style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden', top: 0, left: 0 }}
      onClick={isSnapped && onSnapClick ? onSnapClick : undefined}
    >
      {pos && <Arrow side={pos.side} />}
      {children}
    </div>,
    document.body,
  )
}
