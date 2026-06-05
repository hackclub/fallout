import { usePage } from '@inertiajs/react'
import type { SharedProps } from '@/types'
import type { Announcement } from './types'

export function useUnsubmittedHoursAnnouncement(): Announcement | null {
  const { unsubmitted_hours } = usePage<SharedProps>().props
  if (!unsubmitted_hours) return null

  return {
    id: 'unsubmitted-hours',
    kind: 'info',
    message: `You've logged ${unsubmitted_hours} hours — submit a project to count them toward qualification.`,
    href: '/projects',
    modal: true,
    dismissible: false,
  }
}
