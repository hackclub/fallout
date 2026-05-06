import { motion, type Variants } from 'motion/react'
import type { Announcement, AnnouncementKind } from './types'
import { dismissAnnouncement } from './storage'

type Props = {
  announcement: Announcement
  index: number
  stacked: boolean
  isOnly: boolean
}

const STYLES: Record<AnnouncementKind, string> = {
  critical:
    'bg-brown text-beige py-2 px-3 lg:px-6 text-sm sm:text-lg shadow-[0_3px_0_rgba(97,69,58,0.35)] underline decoration-1 underline-offset-2 hover:bg-light-brown hover:text-dark-brown',
  info: 'bg-light-brown text-dark-brown py-2 px-3 lg:px-5 text-sm sm:text-base shadow-[0_2px_0_rgba(97,69,58,0.3)] hover:bg-yellow',
  promo:
    'bg-yellow text-dark-brown py-1.5 px-3 lg:px-5 text-xs sm:text-sm shadow-[0_2px_0_rgba(97,69,58,0.25)] hover:bg-light-brown',
}

const TACK_COLOR: Record<AnnouncementKind, string> = {
  critical: 'bg-coral',
  info: 'bg-brown',
  promo: 'bg-dark-yellow',
}

const TILT_PATTERN = [-1, 1, -1.5, 1.5]

function tiltFor(index: number, stacked: boolean): number {
  if (!stacked || typeof window === 'undefined') return 0
  if (window.matchMedia('(max-width: 480px)').matches) return 0
  return TILT_PATTERN[index] ?? 0
}

const cardVariants: Variants = {
  hidden: { opacity: 0, y: -10, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -8, scale: 0.96, transition: { duration: 0.18 } },
}

export default function AnnouncementCard({ announcement, index, stacked, isOnly }: Props) {
  const tilt = tiltFor(index, stacked)
  const isCritical = announcement.kind === 'critical'

  const baseClass =
    'relative pointer-events-auto block border border-dark-brown rounded-xs transition-colors text-center font-medium overflow-hidden'
  const styleClass = STYLES[announcement.kind]
  const paddingShift = isCritical ? 'pl-4' : '' // Make room for the coral accent stripe.

  const content = (
    <>
      {isCritical && <span aria-hidden className="absolute left-0 top-0 bottom-0 w-1 bg-coral rounded-l-xs" />}
      {stacked && (
        <span
          aria-hidden
          className={`absolute -top-1.5 left-1/2 -translate-x-1/2 size-2.5 rounded-full ring-1 ring-dark-brown/40 shadow-[0_1px_0_rgba(97,69,58,0.5)] ${TACK_COLOR[announcement.kind]}`}
        />
      )}
      <span className="inline-flex items-center justify-center gap-2">
        <span>{announcement.message}</span>
        {announcement.dismissible && (
          <button
            type="button"
            aria-label="Dismiss announcement"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              dismissAnnouncement(announcement.id)
            }}
            className="ml-1 size-5 leading-none flex items-center justify-center rounded-full hover:bg-dark-brown/15 transition-colors cursor-pointer"
          >
            <span aria-hidden>×</span>
          </button>
        )}
      </span>
    </>
  )

  const widthClass = isOnly ? 'mx-auto w-full xs:w-fit' : 'w-full'

  return (
    <motion.li
      layout="position"
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={{ type: 'spring', stiffness: 380, damping: 30, mass: 0.5 }}
      style={{ rotate: tilt, transformOrigin: 'center top' }}
      whileHover={stacked ? { rotate: 0, y: -2 } : { y: -1 }}
      className={widthClass}
    >
      {announcement.href ? (
        <a
          href={announcement.href}
          target={announcement.external ? '_blank' : undefined}
          rel={announcement.external ? 'noopener noreferrer' : undefined}
          className={`${baseClass} ${styleClass} ${paddingShift}`}
        >
          {content}
        </a>
      ) : (
        <div className={`${baseClass} ${styleClass} ${paddingShift}`}>{content}</div>
      )}
    </motion.li>
  )
}
