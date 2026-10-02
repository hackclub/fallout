import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Tabs as TabsPrimitive } from 'radix-ui'
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  useVelocity,
} from 'motion/react'
import type { LucideIcon } from 'lucide-react'

export type ReviewTabTint = 'green' | 'blue' | 'amber' | 'violet' | 'gray'

export interface ReviewTab {
  id: string
  title: string
  icon: LucideIcon
  activeIcon?: LucideIcon
  tint: ReviewTabTint
}

export const ReviewTabsRoot = TabsPrimitive.Root

/** Content panel that stays mounted while hidden so viewer state (open file, scroll, 3D camera) survives tab switches. */
export function ReviewTabPanel({
  value,
  children,
  className,
}: {
  value: string
  children: ReactNode
  className?: string
}) {
  return (
    <TabsPrimitive.Content value={value} forceMount className={`rc-view ${className ?? ''}`}>
      {children}
    </TabsPrimitive.Content>
  )
}

/**
 * Segmented tab bar with a raised pill that glides between tabs on a spring, squishing with
 * horizontal velocity. The active tab doubles as a drag handle: the pill leans toward the pull
 * with rubber-band resistance, snaps to the nearest tab, and commits it on release.
 */
export function ReviewTabBar({
  tabs,
  value,
  onValueChange,
}: {
  tabs: ReviewTab[]
  value: string
  onValueChange: (id: string) => void
}) {
  const listRef = useRef<HTMLDivElement | null>(null)
  return (
    <TabsPrimitive.List ref={listRef} className="rc-tabbar" aria-label="Review views">
      {tabs.map((t) => (
        <TabsPrimitive.Trigger key={t.id} value={t.id} className="rc-tab" asChild>
          <motion.button type="button">
            <TabInner tab={t} active={t.id === value} />
          </motion.button>
        </TabsPrimitive.Trigger>
      ))}
      <TabIndicator
        listRef={listRef}
        tabs={tabs}
        activeId={value}
        onSelect={(i) => tabs[i] && onValueChange(tabs[i].id)}
      />
    </TabsPrimitive.List>
  )
}

function TabInner({ tab, active }: { tab: ReviewTab; active: boolean }) {
  const Icon = active && tab.activeIcon ? tab.activeIcon : tab.icon
  return (
    <span className="rc-tab-inner">
      <span className="rc-tab-chip" data-tint={tab.tint}>
        <Icon size={14} strokeWidth={2.5} aria-hidden />
      </span>
      {tab.title}
    </span>
  )
}

// quick spring with a little bounce (ζ≈0.76 → slight overshoot, fast settle)
const INDICATOR_SPRING = { stiffness: 600, damping: 37, mass: 1 }

function TabIndicator({
  listRef,
  tabs,
  activeId,
  onSelect,
}: {
  listRef: RefObject<HTMLDivElement | null>
  tabs: ReviewTab[]
  activeId: string
  onSelect: (index: number) => void
}) {
  const reduceMotion = useReducedMotion()
  const [visible, setVisible] = useState(false)
  const initialized = useRef(false)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  // the colored twin of the tab row, revealed only inside the pill
  const layerRef = useRef<HTMLSpanElement | null>(null)

  const left = useSpring(0, INDICATOR_SPRING)
  const width = useSpring(0, INDICATOR_SPRING)
  const top = useMotionValue(0)
  const height = useMotionValue(0)
  // full extent of the color layer, so clip insets can be measured from the far edges
  const layerW = useMotionValue(0)
  const layerH = useMotionValue(0)
  // the faster the pill travels, the flatter it gets; relaxes to 1 at rest
  const velocity = useVelocity(left)
  const squish = useTransform(velocity, [-1100, 0, 1100], [0.82, 1, 0.82], { clamp: true })
  // reveal window = the pill's rect; the color layer shows through only here, so
  // the tint (and darker label) wipes across each glyph as the pill slides over it
  const clipRight = useTransform(() => Math.max(0, layerW.get() - left.get() - width.get()))
  const clipBottom = useTransform(() => Math.max(0, layerH.get() - top.get() - height.get()))
  const clipPath = useMotionTemplate`inset(${top}px ${clipRight}px ${clipBottom}px ${left}px round 999px)`

  // passive effect, NOT useLayoutEffect: layout effects run bottom-up, so the
  // parent Tabs.List ref isn't attached yet when this child's would fire
  useEffect(() => {
    const list = listRef.current
    if (!list) return

    const tabEls = () => Array.from(list.querySelectorAll<HTMLElement>('[role="tab"]'))
    const goTo = (el: HTMLElement, jump: boolean) => {
      top.set(el.offsetTop)
      height.set(el.offsetHeight)
      if (jump) {
        left.jump(el.offsetLeft)
        width.jump(el.offsetWidth)
      } else {
        left.set(el.offsetLeft)
        width.set(el.offsetWidth)
      }
    }
    const measure = () => {
      const layer = layerRef.current
      if (layer) {
        layerW.set(layer.offsetWidth)
        layerH.set(layer.offsetHeight)
      }
      // Radix marks the active trigger with data-state="active"
      const el = list.querySelector<HTMLElement>('[role="tab"][data-state="active"]')
      if (!el) return
      const first = !initialized.current
      goTo(el, first || !!reduceMotion)
      if (first) {
        initialized.current = true
        setVisible(true)
      }
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(list)

    // -- grab-and-drag: starts on the active tab, snaps to nearest, commits on
    // release. move/up listeners live on window so releasing OUTSIDE the bar
    // still ends the drag.
    let drag: {
      pointerId: number
      startX: number
      started: boolean
      snapped: number
      innerEl: HTMLElement | null
      cloneInnerEl: HTMLElement | null
    } | null = null

    const clearContentLean = () => {
      if (drag?.innerEl) drag.innerEl.style.transform = ''
      if (drag?.cloneInnerEl) drag.cloneInnerEl.style.transform = ''
    }

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      const tab = (e.target as HTMLElement).closest<HTMLElement>('[role="tab"]')
      if (!tab || tab.dataset.state !== 'active') return
      drag = {
        pointerId: e.pointerId,
        startX: e.clientX,
        started: false,
        snapped: -1,
        innerEl: null,
        cloneInnerEl: null,
      }
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pointerId) return
      if (!drag.started) {
        if (Math.abs(e.clientX - drag.startX) < 5) return // still a click
        drag.started = true
        list.dataset['dragging'] = 'true'
      }
      const rect = list.getBoundingClientRect()
      const x = e.clientX - rect.left + list.scrollLeft
      const els = tabEls()
      let nearest = 0
      let best = Infinity
      els.forEach((el, i) => {
        const d = Math.abs(el.offsetLeft + el.offsetWidth / 2 - x)
        if (d < best) {
          best = d
          nearest = i
        }
      })
      const el = els[nearest]
      if (!el) return
      if (drag.snapped !== nearest) {
        clearContentLean() // previous slot's label settles back
        drag.snapped = nearest
        drag.innerEl = el.querySelector<HTMLElement>('.rc-tab-inner')
        drag.cloneInnerEl = layerRef.current?.children[nearest]?.querySelector<HTMLElement>('.rc-tab-inner') ?? null
      }
      // iPad-pointer feel: the pill stays seated in its slot but LEANS toward
      // the pull with saturating resistance (tanh rubber-band, max ±18px).
      // Crossing the midpoint flips the slot and the spring carries it over.
      const center = el.offsetLeft + el.offsetWidth / 2
      const lean = Math.tanh((x - center) / (el.offsetWidth * 1.15)) * 18
      top.set(el.offsetTop)
      height.set(el.offsetHeight)
      left.set(el.offsetLeft + lean)
      width.set(el.offsetWidth)
      // the label rides along at half strength — content has less inertia.
      // the colored twin leans identically so it stays registered under the pill
      if (!reduceMotion) {
        const t = `translateX(${lean * 0.5}px)`
        if (drag.innerEl) drag.innerEl.style.transform = t
        if (drag.cloneInnerEl) drag.cloneInnerEl.style.transform = t
      }
    }
    const endDrag = (e: PointerEvent, commit: boolean) => {
      if (!drag || e.pointerId !== drag.pointerId) return
      clearContentLean()
      const { started, snapped } = drag
      drag = null
      delete list.dataset['dragging']
      if (!started) return // plain click — native tab activation handles it
      if (commit && snapped >= 0) onSelectRef.current(snapped)
      // always re-seat: shakes off the drag lean even when the committed tab
      // is the one we started on (no activeId change → no effect re-run)
      measure()
    }
    const onPointerUp = (e: PointerEvent) => endDrag(e, true)
    const onPointerCancel = (e: PointerEvent) => endDrag(e, false)

    list.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
    return () => {
      ro.disconnect()
      list.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
    }
  }, [listRef, activeId, reduceMotion, left, width, top, height, layerW, layerH])

  return (
    <>
      <motion.span
        className="rc-tab-indicator"
        style={{ left, width, top, height, scaleY: reduceMotion ? 1 : squish, opacity: visible ? 1 : 0 }}
        aria-hidden
      />
      {/* colored twin of the tab row, clipped to the pill — its tint + darker
          label show through only where the indicator currently sits */}
      <motion.span
        ref={layerRef}
        className="rc-tab-colorlayer"
        style={{ clipPath, opacity: visible ? 1 : 0 }}
        aria-hidden
      >
        {tabs.map((t) => (
          <span key={t.id} className="rc-tab" data-state={t.id === activeId ? 'active' : 'inactive'}>
            <TabInner tab={t} active={t.id === activeId} />
          </span>
        ))}
      </motion.span>
    </>
  )
}
