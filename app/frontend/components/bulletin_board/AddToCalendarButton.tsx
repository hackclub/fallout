import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { CalendarPlus, Download, ExternalLink } from 'lucide-react'
import clsx from 'clsx'
import { googleCalendarUrl, icsDownloadUrl, outlookCalendarUrl } from '@/lib/bulletinCalendarLinks'
import type { SerializedBulletinEvent } from '@/lib/bulletinEventStatus'
import styles from './AddToCalendarButton.module.scss'

type Props = {
  event: SerializedBulletinEvent
  variant?: 'iconOnly' | 'labeled'
  ariaLabel?: string
}

const POPOVER_WIDTH = 240
const POPOVER_OFFSET = 8

export default function AddToCalendarButton({ event, variant = 'iconOnly', ariaLabel }: Props) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  const computePosition = () => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    let left = rect.right - POPOVER_WIDTH
    if (left < POPOVER_OFFSET) left = POPOVER_OFFSET
    if (left + POPOVER_WIDTH > viewportWidth - POPOVER_OFFSET) {
      left = viewportWidth - POPOVER_WIDTH - POPOVER_OFFSET
    }

    let top = rect.bottom + POPOVER_OFFSET
    // Flip above the trigger if the popover would extend off the bottom.
    if (top + 200 > viewportHeight) {
      top = Math.max(POPOVER_OFFSET, rect.top - POPOVER_OFFSET - 200)
    }

    setPosition({ top, left })
  }

  useLayoutEffect(() => {
    if (!open) return
    computePosition()
  }, [open])

  useEffect(() => {
    if (!open) return

    const handle = () => computePosition()
    // Capture-phase + stopPropagation: the bulletin board itself can render inside an Inertia
    // Modal whose own keydown handler also closes on Esc. Without this, hitting Esc on an open
    // popover would dismiss the bulletin board page instead of just the popover.
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(false)
    }

    window.addEventListener('resize', handle)
    window.addEventListener('scroll', handle, true)
    window.addEventListener('keydown', handleKey, true)

    return () => {
      window.removeEventListener('resize', handle)
      window.removeEventListener('scroll', handle, true)
      window.removeEventListener('keydown', handleKey, true)
    }
  }, [open])

  const handleTriggerClick = (e: MouseEvent<HTMLButtonElement>) => {
    // EventCard wraps the entire card in a ModalLink; stop the click from triggering navigation.
    e.preventDefault()
    e.stopPropagation()
    setOpen((prev) => !prev)
  }

  const closePopover = () => setOpen(false)

  const googleUrl = googleCalendarUrl(event)
  const outlookUrl = outlookCalendarUrl(event)
  const downloadUrl = icsDownloadUrl(event.id)

  const popover =
    typeof document !== 'undefined'
      ? createPortal(
          <AnimatePresence>
            {open && position && (
              <motion.div
                key="shield"
                className={styles.popoverShield}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  closePopover()
                }}
                role="presentation"
              />
            )}
            {open && position && (
              <motion.div
                key="popover"
                role="menu"
                className={styles.popover}
                style={{ top: position.top, left: position.left, width: POPOVER_WIDTH }}
                initial={{ opacity: 0, y: -4, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 360, damping: 28, mass: 0.4 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className={styles.popoverHeading}>Add to calendar</div>
                {googleUrl && (
                  <a
                    href={googleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.option}
                    role="menuitem"
                    onClick={closePopover}
                  >
                    <ExternalLink className={styles.optionIcon} aria-hidden />
                    <span className={styles.optionLabel}>Google Calendar</span>
                  </a>
                )}
                <a
                  href={downloadUrl}
                  className={styles.option}
                  role="menuitem"
                  download={`fallout-event-${event.id}.ics`}
                  onClick={closePopover}
                >
                  <Download className={styles.optionIcon} aria-hidden />
                  <span className={styles.optionLabel}>Apple / Outlook</span>
                  <span className={styles.optionSub}>.ics file</span>
                </a>
                {outlookUrl && (
                  <a
                    href={outlookUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.option}
                    role="menuitem"
                    onClick={closePopover}
                  >
                    <ExternalLink className={styles.optionIcon} aria-hidden />
                    <span className={styles.optionLabel}>Outlook.com</span>
                  </a>
                )}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )
      : null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleTriggerClick}
        aria-label={ariaLabel ?? 'Add to calendar'}
        aria-haspopup="menu"
        aria-expanded={open}
        className={clsx(styles.trigger, variant === 'iconOnly' ? styles.triggerIconOnly : styles.triggerLabeled)}
      >
        <CalendarPlus className={styles.triggerIcon} aria-hidden />
        {variant === 'labeled' && <span>Add to calendar</span>}
      </button>
      {popover}
    </>
  )
}
