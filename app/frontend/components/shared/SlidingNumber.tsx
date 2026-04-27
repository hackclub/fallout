import { memo, useEffect } from 'react'
import { type MotionValue, motion, useReducedMotion, useSpring, useTransform } from 'motion/react'

const TRANSITION = {
  type: 'spring' as const,
  stiffness: 280,
  damping: 18,
  mass: 0.3,
}

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const

const Number = memo(function Number({ mv, number }: { mv: MotionValue<number>; number: number }) {
  const y = useTransform(mv, (latest) => {
    const placeValue = latest % 10
    const offset = (10 + number - placeValue) % 10
    const slots = offset > 5 ? offset - 10 : offset
    return `${slots * 100}%`
  })

  return (
    <motion.span style={{ y }} className="absolute inset-0 flex items-center justify-center">
      {number}
    </motion.span>
  )
})

const Digit = memo(function Digit({ digit }: { digit: number }) {
  const animatedValue = useSpring(digit, TRANSITION)

  useEffect(() => {
    animatedValue.set(digit)
  }, [animatedValue, digit])

  return (
    <div className="relative inline-block w-[1ch] overflow-x-visible overflow-y-clip leading-none tabular-nums">
      <div className="invisible">0</div>
      {DIGITS.map((i) => (
        <Number key={i} mv={animatedValue} number={i} />
      ))}
    </div>
  )
})

type SlidingNumberProps = {
  value: number
  padStart?: boolean
  decimalSeparator?: string
}

export const SlidingNumber = memo(function SlidingNumber({
  value,
  padStart = false,
  decimalSeparator = '.',
}: SlidingNumberProps) {
  const shouldReduceMotion = useReducedMotion()
  const absValue = Math.abs(value)
  const [integerPart, decimalPart] = absValue.toString().split('.')
  const integerValue = parseInt(integerPart, 10)
  const paddedInteger = padStart && integerValue < 10 ? `0${integerPart}` : integerPart

  if (shouldReduceMotion) {
    return (
      <span className="flex items-center tabular-nums">
        {value < 0 && '-'}
        {paddedInteger}
        {decimalPart && (
          <>
            <span>{decimalSeparator}</span>
            {decimalPart}
          </>
        )}
      </span>
    )
  }

  const integerDigits = paddedInteger.split('')
  const decimalDigits = decimalPart ? decimalPart.split('') : null

  return (
    <div className="flex items-center">
      {value < 0 && '-'}
      {integerDigits.map((digitChar, index) => {
        const place = Math.pow(10, integerDigits.length - index - 1)
        return <Digit key={`pos-${place}`} digit={parseInt(digitChar, 10)} />
      })}
      {decimalDigits && (
        <>
          <span>{decimalSeparator}</span>
          {decimalDigits.map((digitChar, index) => (
            <Digit key={`decimal-${index}`} digit={parseInt(digitChar, 10)} />
          ))}
        </>
      )}
    </div>
  )
})
