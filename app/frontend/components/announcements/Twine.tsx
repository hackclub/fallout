import { motion } from 'motion/react'

export default function Twine() {
  return (
    <motion.svg
      aria-hidden
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 1 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
      className="hidden xs:block absolute inset-x-6 -top-1 h-3 pointer-events-none"
      viewBox="0 0 100 6"
      preserveAspectRatio="none"
    >
      <motion.path
        d="M 0 1 Q 50 5 100 1"
        fill="none"
        stroke="var(--color-dark-brown)"
        strokeOpacity={0.45}
        strokeWidth={0.8}
        strokeLinecap="round"
      />
    </motion.svg>
  )
}
