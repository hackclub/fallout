import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import { Check, Copy, ExternalLink, X } from 'lucide-react'
import clsx from 'clsx'
import { subscriptionUrls } from '@/lib/bulletinCalendarLinks'
import styles from './SubscribeFeedModal.module.scss'

type Props = {
  onClose: () => void
}

export default function SubscribeFeedModal({ onClose }: Props) {
  const [copied, setCopied] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const copyResetTimerRef = useRef<number | null>(null)

  const urls = useMemo(() => {
    if (typeof window === 'undefined') {
      return null
    }
    return subscriptionUrls(window.location.origin)
  }, [])

  useEffect(() => {
    // Capture-phase + stopPropagation: the bulletin board itself can render inside an Inertia
    // Modal whose own keydown handler also closes on Esc. Without this, hitting Esc would
    // dismiss the bulletin board page instead of just this overlay.
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', handleKey, true)
    return () => window.removeEventListener('keydown', handleKey, true)
  }, [onClose])

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current !== null) window.clearTimeout(copyResetTimerRef.current)
    }
  }, [])

  const handleCopy = async () => {
    if (!urls) return
    try {
      await navigator.clipboard.writeText(urls.https)
    } catch {
      // Fallback for environments without clipboard API: select the input text so the user can copy manually.
      inputRef.current?.select()
      return
    }
    setCopied(true)
    if (copyResetTimerRef.current !== null) window.clearTimeout(copyResetTimerRef.current)
    copyResetTimerRef.current = window.setTimeout(() => setCopied(false), 1800)
  }

  if (typeof document === 'undefined' || !urls) return null

  return createPortal(
    <motion.div
      key="subscribe-backdrop"
      className={styles.backdrop}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Subscribe to bulletin board events"
    >
      <motion.div
        key="subscribe-panel"
        className={styles.panel}
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28, mass: 0.6 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 className={styles.title}>Subscribe to events</h2>
          <button type="button" aria-label="Close" className={styles.iconButton} onClick={onClose}>
            <X className={styles.iconButtonIcon} aria-hidden />
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.urlRow}>
            <input
              ref={inputRef}
              type="text"
              readOnly
              className={styles.urlInput}
              value={urls.https}
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              type="button"
              className={clsx(styles.copyButton, copied && styles.copyButtonSuccess)}
              onClick={handleCopy}
              aria-live="polite"
            >
              {copied ? (
                <>
                  <Check className={styles.copyIcon} aria-hidden />
                  Copied
                </>
              ) : (
                <>
                  <Copy className={styles.copyIcon} aria-hidden />
                  Copy
                </>
              )}
            </button>
          </div>

          <div className={styles.providerGrid}>
            <a href={urls.googleAdd} target="_blank" rel="noopener noreferrer" className={styles.providerButton}>
              <ExternalLink className={styles.providerButtonIcon} aria-hidden />
              <span className={styles.providerLabel}>Google Calendar</span>
            </a>
            <a href={urls.webcal} className={styles.providerButton}>
              <ExternalLink className={styles.providerButtonIcon} aria-hidden />
              <span className={styles.providerLabel}>Apple Calendar</span>
            </a>
            <a href={urls.outlookAdd} target="_blank" rel="noopener noreferrer" className={styles.providerButton}>
              <ExternalLink className={styles.providerButtonIcon} aria-hidden />
              <span className={styles.providerLabel}>Outlook</span>
            </a>
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  )
}
