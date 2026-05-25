import { useEffect, useRef } from 'react'

/**
 * NumberPopIn — re-enter each character with a blurred slide whenever the
 * displayed value changes. Uses the transitions-dev `t-digit-group` /
 * `t-digit` tokens declared in admin.css.
 *
 * The replay is done imperatively (remove `.is-animating`, force reflow,
 * re-add) so the animation runs cleanly even when only some digits change.
 */
export default function NumberPopIn({ value, className }: { value: string | number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const str = String(value)

  useEffect(() => {
    const group = ref.current
    if (!group) return
    group.classList.remove('is-animating')
    // force reflow so the re-add restarts the keyframes
    void group.offsetHeight
    group.classList.add('is-animating')
  }, [str])

  const chars = str.split('')
  return (
    <span ref={ref} className={`t-digit-group is-animating ${className ?? ''}`.trim()}>
      {chars.map((ch, i) => {
        // later digits stagger behind the leading digit (cap at 3 to avoid runaway delays)
        const stagger = i > 0 && i <= 3 ? String(i) : undefined
        return (
          <span key={`${i}-${ch}`} className="t-digit" data-stagger={stagger}>
            {ch}
          </span>
        )
      })}
    </span>
  )
}
