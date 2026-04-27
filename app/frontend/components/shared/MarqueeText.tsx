import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import TextMorph from './TextMorph'
import styles from './MarqueeText.module.scss'

type Props = {
  text: string
  className?: string
  morph?: boolean
}

export default function MarqueeText({ text, className, morph = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLSpanElement>(null)
  const copyRef = useRef<HTMLSpanElement>(null)
  const probeRef = useRef<HTMLSpanElement>(null)
  const [shouldMarquee, setShouldMarquee] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    // Measure a hidden probe with the plain settled text rather than copyRef —
    // copyRef contains TextMorph's in-flight exit animations, whose characters
    // linger in layout and would otherwise falsely keep the duplicate visible
    // after switching from a long title to a short one.
    const probe = probeRef.current
    if (!container || !probe) return

    const measure = () => {
      setShouldMarquee(probe.scrollWidth > container.clientWidth + 1)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    observer.observe(probe)
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
          {morph ? <TextMorph as="span">{text}</TextMorph> : text}
        </span>
        {shouldMarquee && (
          <span aria-hidden className={styles.marqueeCopy}>
            {text}
          </span>
        )}
      </span>
      <span ref={probeRef} aria-hidden className={styles.marqueeProbe}>
        {text}
      </span>
    </div>
  )
}
