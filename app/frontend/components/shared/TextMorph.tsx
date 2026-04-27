import { type CSSProperties, type ElementType, memo, useId, useMemo } from 'react'
import { AnimatePresence, motion, type Transition, type Variants, useReducedMotion } from 'motion/react'

export type TextMorphProps = {
  children: string
  as?: ElementType
  className?: string
  style?: CSSProperties
  variants?: Variants
  transition?: Transition
}

const defaultVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
}

const defaultTransition: Transition = {
  type: 'spring',
  stiffness: 280,
  damping: 18,
  mass: 0.3,
}

function TextMorph({ children, as: Component = 'p', className, style, variants, transition }: TextMorphProps) {
  const uniqueId = useId()
  const prefersReducedMotion = useReducedMotion()

  const characters = useMemo(() => {
    const chars = Array.from(children)
    const leftCounts: Record<string, number> = {}
    return chars.map((char) => {
      const lc = char.toLowerCase()
      const leftCount = (leftCounts[lc] = (leftCounts[lc] || 0) + 1)
      return {
        id: `${uniqueId}-${lc}-${leftCount}`,
        label: char === ' ' ? '\u00A0' : char,
      }
    })
  }, [children, uniqueId])

  if (prefersReducedMotion) {
    return (
      <Component className={className} style={style}>
        {children}
      </Component>
    )
  }

  const resolvedVariants = variants ?? defaultVariants
  const resolvedTransition = transition ?? defaultTransition

  return (
    <Component className={className} aria-label={children} style={style}>
      <span className="relative inline-flex whitespace-pre" aria-hidden="true">
        <AnimatePresence mode="popLayout" initial={false}>
          {characters.map((character) => (
            <motion.span
              key={character.id}
              layout="position"
              className="inline-block"
              initial="initial"
              animate="animate"
              exit="exit"
              variants={resolvedVariants}
              transition={resolvedTransition}
            >
              {character.label}
            </motion.span>
          ))}
        </AnimatePresence>
      </span>
    </Component>
  )
}

export default memo(TextMorph)
