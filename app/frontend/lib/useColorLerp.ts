import { useTransform, type MotionValue } from 'motion/react'

/**
 * Interpolate between two CSS colors in HSL as `progress` goes 0 → 1.
 * Returns a MotionValue<string> suitable for passing to a motion component's
 * `style` prop. Accepts any CSS color strings (hex, rgb, named, `var(--...)`).
 */
export function useColorLerp(progress: MotionValue<number>, from: string, to: string): MotionValue<string> {
  return useTransform(progress, (p) => `color-mix(in hsl, ${from} ${(1 - p) * 100}%, ${to} ${p * 100}%)`)
}
