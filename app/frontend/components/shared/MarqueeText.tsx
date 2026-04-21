import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import styles from './MarqueeText.module.scss'

export default function MarqueeText({ text, className }: { text: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLSpanElement>(null)
  const copyRef = useRef<HTMLSpanElement>(null)
  const [shouldMarquee, setShouldMarquee] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    const copy = copyRef.current
    if (!container || !copy) return

    const measure = () => {
      setShouldMarquee(copy.scrollWidth > container.clientWidth + 1)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [text])

  useEffect(() => {
    if (!shouldMarquee) return
    const track = trackRef.current
    const copy = copyRef.current
    if (!track || !copy) return

    const gapPx = parseFloat(getComputedStyle(track).columnGap || '0') || 0
    const distance = copy.offsetWidth + gapPx
    if (distance <= 0) return

    const pxPerSec = 40
    const travel = (distance / pxPerSec) * 1000
    const pause = 3000
    const total = pause + travel

    const animation = track.animate(
      [
        { transform: 'translateX(0)', offset: 0 },
        { transform: 'translateX(0)', offset: pause / total },
        { transform: `translateX(-${distance}px)`, offset: 1 },
      ],
      { duration: total, iterations: Infinity, easing: 'linear' },
    )

    return () => animation.cancel()
  }, [shouldMarquee, text])

  return (
    <div ref={containerRef} className={clsx(styles.marquee, className)}>
      <span ref={trackRef} className={styles.marqueeTrack}>
        <span ref={copyRef} className={styles.marqueeCopy}>
          {text}
        </span>
        {shouldMarquee && (
          <span aria-hidden className={styles.marqueeCopy}>
            {text}
          </span>
        )}
      </span>
    </div>
  )
}
