import { useEffect, useState } from 'react'
import { usePage } from '@inertiajs/react'
import type { SharedProps } from '@/types'
import type { Announcement } from './types'
import { FEEDBACK_ANNOUNCEMENT_ID, isAnnouncementDismissed, subscribeToDismissals } from './storage'

export function useFeedbackAnnouncement(): Announcement | null {
  const { show_feedback_banner } = usePage<SharedProps>().props
  const [dismissed, setDismissed] = useState(() => isAnnouncementDismissed(FEEDBACK_ANNOUNCEMENT_ID))

  useEffect(() => subscribeToDismissals(FEEDBACK_ANNOUNCEMENT_ID, setDismissed), [])

  if (!show_feedback_banner || dismissed) return null

  return {
    id: FEEDBACK_ANNOUNCEMENT_ID,
    kind: 'promo',
    message: 'Share your Fallout feedback — random person gets a $25 USD Amazon Gift Card!',
    href: 'https://forms.hackclub.com/fallout',
    external: true,
    dismissible: true,
  }
}
